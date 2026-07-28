/**
 * toast.js — toast helper.
 *
 * Historically this module hosted a name-keyed localStorage ST tracker
 * (`tm_tracker_<c.name>` / `tm_dt_<c.name>`) parallel to the canonical
 * id-keyed MongoDB tracker in `public/js/game/tracker.js`. The whole
 * persistence surface (stGet/SetTracker, stGet/SetDt, stResetAll,
 * stApplyDowntime, renderStOverview, renderPrestige, stLogDt,
 * stPickChar, stDismiss, togglePrestige, plus the stMax* helpers)
 * was unreachable — none of the exports were window-bound or imported
 * elsewhere, and the DOM IDs they targeted (st-char-list, st-char-sel,
 * st-prestige) existed in no HTML. Removed wholesale in #836; the
 * single live export — `toast` — kept here so app.js:109's import path
 * is unchanged.
 *
 * Legacy localStorage values cached on user devices are still migrated
 * forward into the canonical id-keyed store on first sheet render — see
 * the migration block at public/js/suite/sheet.js:348 (deliberately
 * preserved for one release cycle).
 */

let tTimer;
export function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(tTimer);
  tTimer = setTimeout(() => t.classList.remove('on'), 2500);
}
