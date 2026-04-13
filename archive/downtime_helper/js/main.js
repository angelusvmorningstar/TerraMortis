/**
 * main.js
 * App entry point: wires upload UI to parser, DB, and dashboard.
 * Handles Discord OAuth callback and routes the view by role.
 */

const dropZone     = document.getElementById('drop-zone');
const fileInput    = document.getElementById('file-input');
const fileStatus   = document.getElementById('file-status');
const parseError   = document.getElementById('parse-error');
const exportBtn    = document.getElementById('export-btn');
const publishBtn   = document.getElementById('publish-btn');
const newCycleBtn  = document.getElementById('new-cycle-btn');
const clearBtn     = document.getElementById('clear-btn');
const dbStatus     = document.getElementById('db-status');

// ── Auth state ────────────────────────────────────────────────────────────────

let _currentUser = null;
let _currentRole = null;   // 'st' | 'player' | 'unknown' | null

async function initAuth() {
  // Handle Discord redirect callback (sets token in localStorage, cleans URL)
  const callbackToken = Auth.handleCallback();

  const token = Auth.getToken();
  if (!token) {
    updateAuthUI(null);
    return;
  }

  // Re-fetch user on a fresh callback; otherwise use cached value
  let user = Auth.getStoredUser();
  if (callbackToken || !user) {
    user = await Auth.fetchUser(token);
  }

  _currentUser = user;
  _currentRole = Auth.getRole(user);
  updateAuthUI(user);
}

function updateAuthUI(user) {
  const container = document.getElementById('header-auth');
  if (!user) {
    container.innerHTML = `<button class="btn" id="login-btn">Login with Discord</button>`;
    document.getElementById('login-btn').addEventListener('click', () => Auth.login());
    return;
  }

  const avatarHtml = user.avatar
    ? `<img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=32"
            alt="" class="discord-avatar">`
    : '';

  container.innerHTML = `
    <span class="discord-user-info">
      ${avatarHtml}
      <span class="discord-username">${user.username}</span>
    </span>
    <button class="btn" id="logout-btn">Logout</button>
  `;
  document.getElementById('logout-btn').addEventListener('click', () => {
    Auth.logout();
    location.reload();
  });
}

/** Returns renderDashboard opts for the current user's role. */
function _renderOpts() {
  if (_currentRole === 'player' && _currentUser) {
    return { playerFilter: Auth.getCharacterName(_currentUser) };
  }
  return {};
}

// ── DB initialisation ─────────────────────────────────────────────────────────

db.init().then(async () => {
  await initAuth();
  await refreshFromDB();
}).catch(err => {
  console.error('DB init failed:', err);
  dbStatus.textContent = 'DB unavailable';
});

async function refreshFromDB() {
  if (_currentRole === 'unknown') {
    _showUnknownUser();
    return;
  }

  if (_currentRole === 'player') {
    await _refreshAsPlayer();
    return;
  }

  // ST / no-auth: full dashboard from IndexedDB
  const summary = await db.getSummary();
  const active  = await db.getActiveCycle();

  if (active) {
    const subs = await db.getRawSubmissionsForCycle(active.id);
    window._submissions = subs;

    if (subs.length) {
      renderDashboard(subs);
      showControls();
      fileStatus.textContent =
        `Active cycle: "${active.label}" -- ${subs.length} submission${subs.length !== 1 ? 's' : ''}`;
      fileStatus.className = 'ok';
    }
  }

  updateDBStatus(summary, active);
}

/** Player flow: load published JSON or fall back to local IndexedDB, render filtered. */
async function _refreshAsPlayer() {
  document.getElementById('upload-section').style.display = 'none';

  const characterName = Auth.getCharacterName(_currentUser);
  if (!characterName) {
    fileStatus.textContent = 'Your Discord account is not linked to a character. Contact your Storyteller.';
    fileStatus.className = 'err';
    return;
  }

  // Prefer published static JSON (committed to the repo by the ST)
  let subs = await _fetchPublishedData();

  if (!subs || !subs.length) {
    // Fall back to whatever is in local IndexedDB
    const active = await db.getActiveCycle();
    if (active) subs = await db.getRawSubmissionsForCycle(active.id);
  }

  if (subs && subs.length) {
    window._submissions = subs;
    renderDashboard(subs, { playerFilter: characterName });
    fileStatus.textContent = `Downtime: ${characterName}`;
    fileStatus.className   = 'ok';
  } else {
    document.getElementById('dashboard').style.display = 'none';
    fileStatus.textContent = 'No downtime data available for this cycle yet.';
    fileStatus.className   = '';
  }
}

function _showUnknownUser() {
  document.getElementById('upload-section').style.display = 'none';
  fileStatus.textContent = 'Your Discord account is not linked to a character. Contact your Storyteller.';
  fileStatus.className   = 'err';
}

async function _fetchPublishedData() {
  try {
    const res = await fetch('./data/current_cycle.json');
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data : null;
  } catch { return null; }
}

function updateDBStatus(summary, active) {
  const cycleLabel = active ? `"${active.label}"` : 'none';
  dbStatus.textContent =
    `DB: ${summary.cycles} cycle${summary.cycles !== 1 ? 's' : ''} · ` +
    `${summary.submissions} submissions · ` +
    `${summary.projects} projects · ` +
    `${summary.contacts} contacts · active: ${cycleLabel}`;
}

// ── File handling (ST only) ───────────────────────────────────────────────────

function handleFile(file) {
  if (!file) return;
  if (_currentRole === 'player' || _currentRole === 'unknown') return;

  if (!file.name.endsWith('.csv')) {
    showError('Please upload a .csv file exported from Google Forms.');
    return;
  }

  fileStatus.textContent = `Reading ${file.name}...`;
  fileStatus.className = '';

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const { submissions, warnings } = parseDowntimeCSV(e.target.result);

      if (!submissions.length) {
        showError('No submissions found. Check this is a Google Forms downtime export.');
        return;
      }

      const label  = file.name.replace(/\.csv$/i, '');
      const result = await db.upsertCycle(submissions, label);
      const summary = await db.getSummary();
      const active  = await db.getActiveCycle();

      parseError.style.display = 'none';

      const parts = [];
      if (result.inserted)  parts.push(`${result.inserted} new`);
      if (result.updated)   parts.push(`${result.updated} updated`);
      if (result.unchanged) parts.push(`${result.unchanged} unchanged`);

      fileStatus.textContent = `"${label}" -- ${parts.join(' · ')}`;
      fileStatus.className   = 'ok';

      if (warnings.length) {
        console.warn('Parser warnings:', warnings);
        fileStatus.textContent += ` (${warnings.length} warning${warnings.length !== 1 ? 's' : ''} -- see console)`;
      }

      const subs = await db.getRawSubmissionsForCycle(result.cycleId);
      window._submissions = subs;
      renderDashboard(subs, _renderOpts());
      showControls();
      updateDBStatus(summary, active);

    } catch (err) {
      showError(`Failed: ${err.message}`);
      console.error(err);
    }
  };
  reader.onerror = () => showError('Could not read file.');
  reader.readAsText(file);
}

function showControls() {
  if (_currentRole === 'player') return;
  exportBtn.style.display   = 'inline-block';
  publishBtn.style.display  = 'inline-block';
  newCycleBtn.style.display = 'inline-block';
  clearBtn.style.display    = 'inline-block';
  document.getElementById('upload-section').style.marginBottom = '2rem';
}

function showError(msg) {
  parseError.textContent   = msg;
  parseError.style.display = 'block';
  fileStatus.textContent   = 'Upload failed.';
  fileStatus.className     = 'err';
}

// ── New cycle ─────────────────────────────────────────────────────────────────

newCycleBtn.addEventListener('click', async () => {
  const label = prompt('Name for the new downtime cycle (e.g. "April 2026"):');
  if (!label) return;
  await db.newCycle(label);
  window._submissions = [];
  document.getElementById('dashboard').style.display = 'none';
  exportBtn.style.display  = 'none';
  publishBtn.style.display = 'none';
  const summary = await db.getSummary();
  const active  = await db.getActiveCycle();
  updateDBStatus(summary, active);
  fileStatus.textContent = `New cycle "${label}" started. Upload the CSV when ready.`;
  fileStatus.className   = '';
});

// ── Export JSON ───────────────────────────────────────────────────────────────

exportBtn.addEventListener('click', () => {
  const json = JSON.stringify(window._submissions, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href:     url,
    download: `downtime_${new Date().toISOString().slice(0, 10)}.json`,
  });
  a.click();
  URL.revokeObjectURL(url);
});

// ── Publish Cycle (ST only) ───────────────────────────────────────────────────
// Downloads current_cycle.json -- commit this file to downtime_helper/data/
// and push to GitHub Pages so players can fetch it.

publishBtn.addEventListener('click', () => {
  if (!window._submissions || !window._submissions.length) return;
  const json = JSON.stringify(window._submissions, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href:     url,
    download: 'current_cycle.json',
  });
  a.click();
  URL.revokeObjectURL(url);
  fileStatus.textContent = 'Saved current_cycle.json -- commit it to downtime_helper/data/ and push.';
  fileStatus.className   = 'ok';
});

// ── Clear DB ──────────────────────────────────────────────────────────────────

clearBtn.addEventListener('click', async () => {
  if (!confirm('Clear ALL stored downtime data across all cycles? This cannot be undone.')) return;
  await db.clearAll();
  window._submissions = [];
  document.getElementById('dashboard').style.display = 'none';
  exportBtn.style.display   = 'none';
  publishBtn.style.display  = 'none';
  newCycleBtn.style.display = 'none';
  clearBtn.style.display    = 'none';
  dbStatus.textContent      = 'DB: empty';
  fileStatus.textContent    = 'Database cleared.';
  fileStatus.className      = '';
});

// ── Drag and drop ─────────────────────────────────────────────────────────────

document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop',     (e) => e.preventDefault());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', (e) => {
  if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove('drag-over');
  handleFile(e.dataTransfer.files[0]);
});

fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
