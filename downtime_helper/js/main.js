/**
 * main.js
 * App entry point: wires upload UI to parser, DB, and dashboard.
 */

const dropZone     = document.getElementById('drop-zone');
const fileInput    = document.getElementById('file-input');
const fileStatus   = document.getElementById('file-status');
const parseError   = document.getElementById('parse-error');
const exportBtn    = document.getElementById('export-btn');
const newCycleBtn  = document.getElementById('new-cycle-btn');
const clearBtn     = document.getElementById('clear-btn');
const dbStatus     = document.getElementById('db-status');

// ── DB initialisation ────────────────────────────────────────────────────────

db.init().then(async () => {
  await refreshFromDB();
}).catch(err => {
  console.error('DB init failed:', err);
  dbStatus.textContent = 'DB unavailable';
});

async function refreshFromDB() {
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

function updateDBStatus(summary, active) {
  const cycleLabel = active ? `"${active.label}"` : 'none';
  dbStatus.textContent =
    `DB: ${summary.cycles} cycle${summary.cycles !== 1 ? 's' : ''} · ` +
    `${summary.submissions} submissions · ` +
    `${summary.projects} projects · ` +
    `${summary.contacts} contacts · active: ${cycleLabel}`;
}

// ── File handling ─────────────────────────────────────────────────────────────

function handleFile(file) {
  if (!file) return;

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
      renderDashboard(subs);
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
  exportBtn.style.display   = 'inline-block';
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
  exportBtn.style.display = 'none';
  const summary = await db.getSummary();
  const active  = await db.getActiveCycle();
  updateDBStatus(summary, active);
  fileStatus.textContent = `New cycle "${label}" started. Upload the CSV when ready.`;
  fileStatus.className   = '';
});

// ── Export ────────────────────────────────────────────────────────────────────

exportBtn.addEventListener('click', () => {
  const json = JSON.stringify(window._submissions, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href: url,
    download: `downtime_${new Date().toISOString().slice(0, 10)}.json`
  });
  a.click();
  URL.revokeObjectURL(url);
});

// ── Clear DB ──────────────────────────────────────────────────────────────────

clearBtn.addEventListener('click', async () => {
  if (!confirm('Clear ALL stored downtime data across all cycles? This cannot be undone.')) return;
  await db.clearAll();
  window._submissions = [];
  document.getElementById('dashboard').style.display = 'none';
  exportBtn.style.display   = 'none';
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
