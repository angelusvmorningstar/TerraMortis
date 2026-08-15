/**
 * oxp.7: shared, CONFIRMED-ONLY office-seat holder resolution.
 *
 * Extracted from `office-tab.js`'s own `_wirePurchaseState`, which now calls
 * this same function for its own `held` computation — see that file's own
 * comment on its `held` line. Two call sites sharing one implementation,
 * rather than a second copy that could silently drift from the first (the
 * exact drift risk oxp.6's own review round had to patch a real bug in
 * elsewhere — see its Senior Developer Review section).
 *
 * Deliberately does NOT fall back to a deterministic guess the way
 * `office-tab.js`'s own `_fallbackSeat` does for its reference-browsing mode.
 * `office_seats.holder_id` is not kept current by anything until a handover
 * writes it (oxp.5), so a `court_category` match with no `holder_id` match is
 * genuinely ambiguous — this function returns `null` for that case rather
 * than guess, because oxp.6's own Codex review found a real information leak
 * from presenting a guessed seat's data as a viewer's own confirmed progress.
 * Any caller that needs a best-effort fallback for reference browsing (i.e.
 * office-tab.js's own non-owner view) implements that itself, on top of this
 * function's `null`, exactly as it already does.
 *
 * mirrors the server-side `server/lib/office-seat-resolve.js`'s naming for
 * discoverability, but is NOT the same code — the server module resolves a
 * seat from a URL param for API routes and 400s on an unknown office; this
 * one resolves a character's own confirmed seat from already-fetched seat
 * documents, for client-side read-only display.
 */

/**
 * @param {{_id: string, court_category?: string|null}} char
 * @param {Array<{_id: string, office_category: string, holder_id: string|null}>} seats
 * @returns {object|null} the confirmed seat, or null if this character does
 *   not hold one right now (no court_category, no seats array, or no seat's
 *   holder_id matches this character in their own court_category).
 */
export function resolveHeldSeat(char, seats) {
  if (!char || !char.court_category || !Array.isArray(seats)) return null;
  const forCategory = seats.filter(s => s && s.office_category === char.court_category);
  return forCategory.find(s => s.holder_id != null && String(s.holder_id) === String(char._id)) || null;
}
