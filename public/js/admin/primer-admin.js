/* AR-5: Admin primer management — upload a .docx to replace the player-facing primer. */

function esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}

export async function initPrimerAdmin(el) {
  let h = '<div class="primer-admin-shell">';
  h += '<h3 class="primer-admin-title">Primer</h3>';
  h += '<p class="primer-admin-desc">Upload a .docx to replace the primer shown to all players. The existing primer is overwritten immediately.</p>';
  h += '<div class="ar-upload-form">';
  h += '<div class="ar-upload-fields">';
  h += `<label class="ar-upload-label">File (.docx)
    <input type="file" id="primer-file" accept=".docx">
  </label>`;
  h += '</div>';
  h += '<div class="ar-upload-actions">';
  h += '<button class="dt-btn" id="primer-upload-btn">Upload Primer</button>';
  h += '<span id="primer-upload-status" class="ar-upload-status"></span>';
  h += '</div>';
  h += '</div>';
  h += '</div>';
  el.innerHTML = h;

  document.getElementById('primer-upload-btn').addEventListener('click', async () => {
    const fileInput = document.getElementById('primer-file');
    const statusEl  = document.getElementById('primer-upload-status');
    const btn       = document.getElementById('primer-upload-btn');

    const file = fileInput.files?.[0];
    if (!file) { statusEl.textContent = 'Select a .docx file first.'; return; }

    btn.disabled = true;
    statusEl.textContent = 'Uploading\u2026';

    try {
      const token = localStorage.getItem('tm_auth_token');
      const res = await fetch('/api/archive_documents/upload?type=primer', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: file,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || res.statusText);
      }

      statusEl.textContent = 'Primer updated successfully.';
      fileInput.value = '';
    } catch (err) {
      statusEl.textContent = `Upload failed: ${err.message}`;
    } finally {
      btn.disabled = false;
    }
  });
}
