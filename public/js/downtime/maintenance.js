/**
 * cm-3: the per-character PT/MCI maintenance rule, in one pure place.
 *
 * Extracted from `public/js/admin/downtime-views.js` (the ST audit panel,
 * CHM-2) and `public/js/tabs/downtime-form.js` (the player at-risk warning
 * strip, CHM-3), which had grown their own copies of the same predicates. The
 * behaviour is unchanged in both — the rules below are the originals, moved
 * rather than rewritten — but there is now exactly one definition of "who
 * holds a maintenance merit" and "who still needs a tick", so the ST panel and
 * the player warning cannot drift apart.
 *
 * cm-3's own review found the seam-assertion test comparing a hand-copied
 * mirror of these rules against itself. Living here, they are importable by a
 * plain vitest suite (this module has no browser globals and one pure data
 * import), so the test drives the real production rule instead.
 *
 * NOT in scope here: the finale gate itself (`isFinalChapterOfStory`, in
 * `db.js`), the markup either consumer renders, or any enforcement of
 * `merit.active` — cm-3 is display-only and the ST still toggles merits by
 * hand on the sheet editor.
 */

import { MAINTENANCE_MERITS } from '../tabs/downtime-data.js';

/**
 * What maintenance-bearing merits does this character hold?
 *
 * PT is a flat boolean. MCI may be several rows (one per cult), so the cult
 * names come back for context. The `m.active !== false` guard on MCI matches
 * the ~15 other MCI read sites across the app; PT deliberately has no such
 * guard, which is the asymmetry the original code carried and this keeps.
 */
export function maintenanceHoldings(c) {
  const merits = c?.merits || [];
  const pt = merits.some(m => m.name === 'Professional Training');
  const mciMerits = merits.filter(m => m.name === 'Mystery Cult Initiation' && m.active !== false);
  return {
    pt,
    mci: mciMerits.length > 0,
    mciCults: mciMerits.map(m => m.cult_name).filter(Boolean),
  };
}

/**
 * Which characters belong in the ST's audit table at all: not retired, and
 * holding at least one merit named in MAINTENANCE_MERITS. Callers do their own
 * sorting (the admin panel sorts by sortName, which needs the display helpers).
 */
export function maintenanceEligibleChars(chars) {
  return (chars || [])
    .filter(c => !c.retired)
    .filter(c => (c.merits || []).some(m => MAINTENANCE_MERITS.includes(m.name)));
}

/**
 * Given a character and that character's row from
 * `downtime_cycles.maintenance_audit`, which of their merits still need a
 * tick? An absent row and an explicit `false` are the same thing: not yet
 * confirmed. Only a literal `true` clears a merit.
 */
export function maintenanceAtRisk(char, auditRow) {
  const h = maintenanceHoldings(char);
  const row = auditRow || {};
  return {
    pt: h.pt && row.pt !== true,
    mci: h.mci && row.mci !== true,
    mciCults: h.mciCults,
  };
}
