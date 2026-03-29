/**
 * main.js
 * App entry point: wires upload UI to parser and dashboard.
 */

const dropZone   = document.getElementById('drop-zone');
const fileInput  = document.getElementById('file-input');
const fileStatus = document.getElementById('file-status');
const parseError = document.getElementById('parse-error');

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
  reader.onload = (e) => {
    try {
      const { submissions, warnings } = parseDowntimeCSV(e.target.result);

      if (!submissions.length) {
        showError('No submissions found in this file. Check it is a Google Forms downtime export.');
        return;
      }

      parseError.style.display = 'none';
      fileStatus.textContent = `Loaded ${file.name} -- ${submissions.length} submission${submissions.length !== 1 ? 's' : ''} parsed.`;
      fileStatus.className = 'ok';

      if (warnings.length) {
        console.warn('Parser warnings:', warnings);
        fileStatus.textContent += ` (${warnings.length} warning${warnings.length !== 1 ? 's' : ''} -- see console)`;
      }

      // Expose globally for debugging
      window._submissions = submissions;

      renderDashboard(submissions);
      document.getElementById('upload-section').style.marginBottom = '2rem';
    } catch (err) {
      showError(`Parse failed: ${err.message}`);
      console.error(err);
    }
  };
  reader.onerror = () => showError('Could not read file.');
  reader.readAsText(file);
}

function showError(msg) {
  parseError.textContent = msg;
  parseError.style.display = 'block';
  fileStatus.textContent = 'Upload failed.';
  fileStatus.className = 'err';
}

// ── Drag and drop ─────────────────────────────────────────────────────────────

// Prevent the browser from navigating to the file when drag misses the drop zone
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop',     (e) => e.preventDefault());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', (e) => {
  // Only remove highlight when leaving the drop zone itself, not a child element
  if (!dropZone.contains(e.relatedTarget)) {
    dropZone.classList.remove('drag-over');
  }
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove('drag-over');
  handleFile(e.dataTransfer.files[0]);
});

// ── File input (wired via <label for="file-input"> in HTML -- no JS needed) ──

fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
