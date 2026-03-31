/**
 * Session log module — Engine domain in admin app.
 * Displays, creates, and filters session log entries via the API.
 */

import { apiGet, apiPost } from '../data/api.js';

let currentDate = new Date().toISOString().slice(0, 10);
let entries = [];

/** Render the session log UI into the Engine domain container. */
export async function initSessionLog() {
  const container = document.getElementById('engine-content');
  if (!container) return;

  container.innerHTML = buildShell();

  document.getElementById('log-date').addEventListener('change', e => {
    currentDate = e.target.value;
    loadEntries();
  });

  document.getElementById('log-form').addEventListener('submit', async e => {
    e.preventDefault();
    await createEntry();
  });

  await loadEntries();
}

function buildShell() {
  return `
    <div class="log-toolbar">
      <label class="log-date-label">Session date
        <input type="date" id="log-date" class="log-date-input" value="${currentDate}">
      </label>
      <span id="log-count" class="domain-count"></span>
    </div>
    <form id="log-form" class="log-form">
      <input type="text" id="log-character" class="log-input" placeholder="Character name" required>
      <input type="text" id="log-description" class="log-input log-input-wide" placeholder="Description (e.g. Strength + Brawl)" required>
      <input type="text" id="log-result" class="log-input" placeholder="Result (e.g. 3 successes)">
      <button type="submit" class="log-add-btn">Log</button>
    </form>
    <div id="log-list" class="log-list"></div>`;
}

async function loadEntries() {
  const list = document.getElementById('log-list');
  const count = document.getElementById('log-count');
  try {
    entries = await apiGet('/api/session_logs?session_date=' + currentDate);
    entries.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  } catch (err) {
    list.innerHTML = '<p class="placeholder">Failed to load session log.</p>';
    count.textContent = '';
    return;
  }

  count.textContent = entries.length + ' entries';

  if (!entries.length) {
    list.innerHTML = '<p class="placeholder">No log entries for this date.</p>';
    return;
  }

  list.innerHTML = entries.map(renderEntry).join('');
}

function renderEntry(e) {
  const time = e.timestamp ? new Date(e.timestamp).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }) : '';
  const char = esc(e.character || '');
  const desc = esc(e.description || '');
  const result = esc(e.result || '');
  const st = esc(e.st || '');

  return `<div class="log-entry">
    <div class="log-entry-main">
      <span class="log-entry-char">${char}</span>
      <span class="log-entry-desc">${desc}</span>
      ${result ? '<span class="log-entry-result">' + result + '</span>' : ''}
    </div>
    <div class="log-entry-meta">
      ${time ? '<span class="log-entry-time">' + time + '</span>' : ''}
      ${st ? '<span class="log-entry-st">' + st + '</span>' : ''}
    </div>
  </div>`;
}

async function createEntry() {
  const character = document.getElementById('log-character').value.trim();
  const description = document.getElementById('log-description').value.trim();
  const result = document.getElementById('log-result').value.trim();

  if (!character || !description) return;

  // Get ST name from stored auth user
  let st = '';
  try {
    const raw = localStorage.getItem('tm_auth_user');
    if (raw) {
      const user = JSON.parse(raw);
      st = user.global_name || user.username || '';
    }
  } catch { /* ignore */ }

  const entry = {
    session_date: currentDate,
    timestamp: new Date().toISOString(),
    character,
    description,
    result: result || undefined,
    st,
    type: 'manual',
  };

  try {
    await apiPost('/api/session_logs', entry);
    document.getElementById('log-character').value = '';
    document.getElementById('log-description').value = '';
    document.getElementById('log-result').value = '';
    await loadEntries();
  } catch (err) {
    console.error('Failed to save log entry:', err.message);
  }
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
