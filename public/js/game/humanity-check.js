/* Humanity Check submit tile (gdx.12) — POST-and-toast, no panel, no roll.
 *
 * Player taps "Humanity Check" in the Vampire Mechanics section
 * (char-pools.js) -> submits a pending request via
 * /api/humanity_check_requests -> ST reviews and accepts/declines from the
 * existing Approval Queue (office-approvals.js) -> the pool, once computed,
 * surfaces on the Roll tab for the matching loaded character (see AC7).
 *
 * Kept out of char-pools.js itself, which only renders tiles and never makes
 * network calls — mirrors the separation `office-approvals.js` already keeps
 * between rendering and its own fetch/resolve logic.
 */

import { apiPost, apiGet } from '../data/api.js';
import { toast } from '../suite/toast.js';
import { loadPool } from '../suite/roll-v2.js';

/**
 * @param {object} char - the currently-loaded character
 * @param {HTMLElement} [tileEl] - the tapped tile, disabled immediately to
 *   prevent a double-submit while the request is in flight (mirrors
 *   challenge-initiation.js's submitEl.disabled = true pattern).
 */
export async function submitHumanityCheck(char, tileEl) {
  if (!char?._id) { toast('No character selected'); return; }
  if (tileEl) tileEl.disabled = true;

  try {
    await apiPost('/api/humanity_check_requests', { character_id: String(char._id) });
    toast('Humanity Check submitted — awaiting ST review');
  } catch (err) {
    toast(err.message || 'Failed to submit Humanity Check');
    if (tileEl) tileEl.disabled = false;
  }
}

// AC7 — "Load Pool" surfacing. Session-only: once a resolved Humanity Check
// has been loaded into the roller, its id is remembered here so the banner
// doesn't reappear for the same request after a re-render (a page reload
// clears this, which is the safe default — never lose the ability to load a
// genuinely-computed, still-unrolled pool).
const _loadedRequestIds = new Set();
let _hcGen = 0; // guards a stale fetch (character switched again mid-request)
                 // from painting the banner for the WRONG now-loaded character
                 // — same pattern office-approvals.js's own _fetchGen uses.

/**
 * Checks whether the given character has a resolved, not-yet-loaded
 * Humanity Check, and renders a "Load Pool" banner into containerEl if so.
 * Call once per character-load (app.js's pickChar()) — not polled; a
 * Humanity Check resolves rarely enough that a manual re-pick (or the
 * banner's own Load Pool tap) is sufficient, no 10-second poll needed here.
 *
 * @param {object} char
 * @param {HTMLElement} containerEl - banner is appended as its last child
 */
export async function checkForResolvedHumanityCheck(char, containerEl) {
  if (!char?._id || !containerEl) return;
  const gen = ++_hcGen;

  containerEl.querySelector('#gcp-hc-load-banner')?.remove();

  let rows;
  try {
    rows = await apiGet(`/api/humanity_check_requests/mine?character_id=${encodeURIComponent(String(char._id))}`);
  } catch {
    return; // silent — this is a convenience surface, not a required one
  }
  if (gen !== _hcGen) return; // a newer character load has already superseded this fetch

  const pending = (Array.isArray(rows) ? rows : []).find(r => !_loadedRequestIds.has(String(r._id)));
  if (!pending) return;

  const requestId = String(pending._id);
  const pool = pending.outcome?.pool ?? 0;

  const banner = document.createElement('div');
  banner.id = 'gcp-hc-load-banner';
  banner.className = 'oaq-queue-row-wrap gcp-hc-load-banner';
  banner.innerHTML = `
    <div class="oaq-queue-row">
      <span class="oaq-queue-name">Humanity Check ready — ${pool} ${pool === 1 ? 'die' : 'dice'}</span>
      <button class="ch-btn ch-btn-accept" data-hc-load-btn>Load Pool</button>
    </div>
  `;
  banner.querySelector('[data-hc-load-btn]').addEventListener('click', () => {
    loadPool(pool, 'Humanity Check', {
      total: pool, attr: null, attrV: 0, skill: null, skillV: 0,
      discName: null, discV: 0, resistance: null, noWP: true,
    });
    _loadedRequestIds.add(requestId);
    banner.remove();
  });
  containerEl.appendChild(banner);
}
