/**
 * draft-persist.js — localStorage fallback for the Downtime form.
 *
 * The DT form already debounces a server save at 2 seconds. This module
 * adds a faster (800ms) localStorage mirror so a tab-close, refresh, or
 * brief offline blip doesn't wipe 30 minutes of writing.
 *
 * Flow:
 *   input → saveDraft()        fires within ~1s into localStorage
 *   input → scheduleSave() (existing) still POSTs/PUTs to /api/... every 2s
 *   server save success → clearDraft() to drop the local mirror
 *   submit success      → clearDraft()
 *   form mount          → loadDraft() returns the local responses OR null.
 *                         Caller picks whichever is newer than the server
 *                         doc's updated_at.
 */

const VERSION = 1;

function key(charId, cycleId) {
  return `tm-dt-draft-${charId}-${cycleId}`;
}

/**
 * Store form responses against (character, cycle). Writes are small (a
 * single submission's responses object) so quota-exceeded is unlikely;
 * we silently no-op if it happens.
 */
export function saveDraft(charId, cycleId, responses) {
  if (!charId || !cycleId) return;
  try {
    const payload = {
      v: VERSION,
      saved_at: new Date().toISOString(),
      responses,
    };
    localStorage.setItem(key(charId, cycleId), JSON.stringify(payload));
  } catch {
    // QuotaExceeded or storage disabled — acceptable fallback failure.
  }
}

/**
 * Return the stored payload `{ saved_at, responses }` or null if none
 * exists / is unreadable / is from an incompatible version.
 */
export function loadDraft(charId, cycleId) {
  if (!charId || !cycleId) return null;
  try {
    const raw = localStorage.getItem(key(charId, cycleId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== VERSION) return null;
    if (!parsed.saved_at || !parsed.responses) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Drop the local draft (call on successful server save or submit). */
export function clearDraft(charId, cycleId) {
  if (!charId || !cycleId) return;
  try {
    localStorage.removeItem(key(charId, cycleId));
  } catch {
    // Never let storage errors break the form.
  }
}

/**
 * Pick the freshest source of responses. Returns { responses, from } where
 * `from` is 'local' or 'server'. Local wins when its saved_at is strictly
 * newer than server.updated_at (or server has no updated_at at all).
 */
export function pickFreshestDraft(localPayload, serverDoc) {
  if (!localPayload) return { responses: serverDoc?.responses || {}, from: 'server' };
  const localTs = Date.parse(localPayload.saved_at) || 0;
  const serverTs = Date.parse(serverDoc?.updated_at || '') || 0;
  if (!serverDoc || localTs > serverTs) {
    return { responses: localPayload.responses, from: 'local' };
  }
  return { responses: serverDoc.responses || {}, from: 'server' };
}
