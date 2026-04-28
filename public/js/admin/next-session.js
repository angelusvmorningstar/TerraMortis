/**
 * Next Session panel — lets STs set the upcoming game date, doors-open time,
 * and game number. Rendered at the top of the Engine domain.
 * Downtime deadline is read from the active downtime cycle (set in the Downtime tab).
 */

import { apiGet, apiPost, apiPut } from '../data/api.js';

let _sessionId = null;

export function initNextSession() {
  const el = document.getElementById('next-session-content');
  if (!el) return;
  el.innerHTML = buildPanel();
  el.querySelector('#ns-save').addEventListener('click', saveNext);
  loadNext();
}

function buildPanel() {
  return `
<div class="dt-card" style="margin-bottom:1.5rem;">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.1rem;">
    <h3 style="font-family:var(--fh2);font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);margin:0;">Next Session</h3>
    <span id="ns-status" style="font-size:.78rem;color:var(--muted);font-style:italic;"></span>
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1rem;margin-bottom:1rem;">
    <label class="dt-deadline-edit">
      <span>Game Date</span>
      <input type="date" id="ns-date">
    </label>
    <label class="dt-deadline-edit">
      <span>Doors Open</span>
      <input type="time" id="ns-time">
    </label>
    <label class="dt-deadline-edit">
      <span>Game Number</span>
      <input type="number" id="ns-game-number" min="1" style="width:5rem;">
    </label>
    <label class="dt-deadline-edit">
      <span>Chapter Number</span>
      <input type="number" id="ns-chapter-number" min="1" style="width:5rem;">
    </label>
    <label class="dt-deadline-edit">
      <span>Chapter Label</span>
      <input type="text" id="ns-chapter-label" placeholder="e.g. Ch 1, Game 3">
    </label>
    <label class="dt-deadline-edit" style="grid-column:1/-1;">
      <span>Downtime Deadline (shown on website)</span>
      <input type="text" id="ns-deadline" placeholder="e.g. Friday 1 May 2026 at 11:59 PM" style="width:100%;">
    </label>
  </div>
  <div style="display:flex;align-items:center;gap:.75rem;">
    <button class="dt-btn" id="ns-save">Save</button>
    <span id="ns-saved" style="font-size:.8rem;color:var(--muted);display:none;">Saved.</span>
  </div>
  <p style="margin:.75rem 0 0;font-size:.75rem;color:var(--muted);">If deadline is blank, the website falls back to the active downtime cycle deadline.</p>
</div>`;
}

async function loadNext() {
  const status = document.getElementById('ns-status');
  try {
    const session = await apiGet('/api/game_sessions/next');
    if (session && session._id) {
      _sessionId = session._id;
      document.getElementById('ns-date').value        = session.session_date || '';
      document.getElementById('ns-time').value        = session.doors_open || '';
      document.getElementById('ns-game-number').value    = session.game_number != null ? session.game_number : '';
      document.getElementById('ns-chapter-number').value = session.chapter_number != null ? session.chapter_number : '';
      document.getElementById('ns-chapter-label').value  = session.chapter_label || '';
      document.getElementById('ns-deadline').value       = session.downtime_deadline || '';
      status.textContent = session.game_number != null
        ? `Loaded: Game ${session.game_number}`
        : `Loaded: ${session.session_date}`;
    } else {
      _sessionId = null;
      status.textContent = 'No upcoming session — fill in to create one';
    }
  } catch (e) {
    status.textContent = 'Could not load';
  }
}

async function saveNext() {
  const date = document.getElementById('ns-date').value;
  if (!date) { alert('Session date is required.'); return; }

  const gameNum = document.getElementById('ns-game-number').value;
  const chapterNum = document.getElementById('ns-chapter-number').value;
  const chapterLbl = document.getElementById('ns-chapter-label').value.trim();
  const deadline = document.getElementById('ns-deadline').value.trim();
  const body = {
    session_date:      date,
    doors_open:        document.getElementById('ns-time').value || undefined,
    game_number:       gameNum ? parseInt(gameNum, 10) : undefined,
    chapter_number:    chapterNum ? parseInt(chapterNum, 10) : undefined,
    chapter_label:     chapterLbl || undefined,
    downtime_deadline: deadline || undefined,
  };

  try {
    if (_sessionId) {
      await apiPut(`/api/game_sessions/${_sessionId}`, body);
    } else {
      const created = await apiPost('/api/game_sessions', body);
      _sessionId = created._id;
    }
    const savedEl = document.getElementById('ns-saved');
    savedEl.style.display = 'inline';
    setTimeout(() => { savedEl.style.display = 'none'; }, 2500);
    document.getElementById('ns-status').textContent = 'Saved';
  } catch (e) {
    alert(`Save failed: ${e.message}`);
  }
}
