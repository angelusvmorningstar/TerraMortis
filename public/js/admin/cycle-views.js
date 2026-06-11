import { apiGet, apiPost, apiDelete, apiPut } from '../data/api.js';

const PHASE_LABELS = {
  game:       'Game',
  downtime:   'Downtime',
  processing: 'Processing',
};

export async function initCycleView(charList) {
  const el = document.getElementById('cycle-content');
  el.innerHTML = '<p style="padding:16px;color:var(--txt2)">Loading…</p>';

  let chapters, cycles;
  try {
    [chapters, cycles] = await Promise.all([
      apiGet('/api/chapters'),
      apiGet('/api/downtime_cycles'),
    ]);
  } catch (err) {
    el.innerHTML = `<p style="padding:16px;color:var(--crim)">Failed to load cycle data: ${err.message}</p>`;
    return;
  }

  el.innerHTML = '';
  el.appendChild(buildChaptersPanel(chapters));
  el.appendChild(buildCyclesPanel(cycles, chapters, charList));
}

// ── Chapters panel ──────────────────────────────────────────────────────────

function buildChaptersPanel(chapters) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin-bottom:32px';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:12px';
  header.innerHTML = '<h3 style="margin:0;font-family:Cinzel,serif;font-size:15px;letter-spacing:.04em">Chapters</h3>';

  const addBtn = document.createElement('button');
  addBtn.className = 'btn-sm';
  addBtn.textContent = '+ New Chapter';
  header.appendChild(addBtn);

  const errMsg = document.createElement('p');
  errMsg.style.cssText = 'color:var(--crim);font-size:13px;margin:4px 0 0;display:none';

  wrap.appendChild(header);

  const table = document.createElement('table');
  table.className = 'infl-table';
  table.style.cssText = 'width:100%;margin-bottom:8px';
  table.innerHTML = `<thead><tr>
    <th style="width:60px">#</th>
    <th>Label</th>
    <th style="width:80px"></th>
  </tr></thead>`;
  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  wrap.appendChild(table);
  wrap.appendChild(errMsg);

  function renderRows(list) {
    tbody.innerHTML = '';
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="3" style="color:var(--txt2);padding:8px">No chapters yet.</td></tr>';
      return;
    }
    list.forEach(ch => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${ch.number}</td>
        <td>${ch.label}</td>
        <td><button class="btn-sm" data-id="${ch._id}" style="background:var(--crim);border-color:var(--crim)">Delete</button></td>`;
      tr.querySelector('button').addEventListener('click', async () => {
        errMsg.style.display = 'none';
        try {
          await apiDelete(`/api/chapters/${ch._id}`);
          renderRows(list.filter(c => c._id !== ch._id));
        } catch (err) {
          if (err.message && err.message.includes('cycle')) {
            errMsg.textContent = `Chapter is linked to cycle(s) — remove the link before deleting.`;
          } else {
            errMsg.textContent = `Delete failed: ${err.message}`;
          }
          errMsg.style.display = 'block';
        }
      });
      tbody.appendChild(tr);
    });
  }

  renderRows(chapters);

  // Inline new-chapter form
  const form = document.createElement('div');
  form.style.cssText = 'display:none;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px';
  form.innerHTML = `
    <input id="new-ch-num" type="number" min="1" placeholder="Number" style="width:70px;padding:4px 6px;background:var(--surf);border:1px solid var(--bdr);color:var(--txt);border-radius:4px">
    <input id="new-ch-label" type="text" placeholder="Label (e.g. Chapter Two: The Price of Power)" style="flex:1;min-width:200px;padding:4px 6px;background:var(--surf);border:1px solid var(--bdr);color:var(--txt);border-radius:4px">
    <button class="btn-sm" id="new-ch-save">Save</button>
    <button class="btn-sm" id="new-ch-cancel" style="background:var(--surf2);border-color:var(--bdr)">Cancel</button>`;
  wrap.appendChild(form);

  addBtn.addEventListener('click', () => {
    form.style.display = 'flex';
    addBtn.style.display = 'none';
    errMsg.style.display = 'none';
    form.querySelector('#new-ch-num').value = '';
    form.querySelector('#new-ch-label').value = '';
    form.querySelector('#new-ch-num').focus();
  });

  form.querySelector('#new-ch-cancel').addEventListener('click', () => {
    form.style.display = 'none';
    addBtn.style.display = '';
  });

  form.querySelector('#new-ch-save').addEventListener('click', async () => {
    const number = parseInt(form.querySelector('#new-ch-num').value, 10);
    const label  = form.querySelector('#new-ch-label').value.trim();
    if (!number || !label) {
      errMsg.textContent = 'Both Number and Label are required.';
      errMsg.style.display = 'block';
      return;
    }
    errMsg.style.display = 'none';
    try {
      const created = await apiPost('/api/chapters', { number, label });
      chapters = [...chapters, created].sort((a, b) => a.number - b.number);
      renderRows(chapters);
      form.style.display = 'none';
      addBtn.style.display = '';
    } catch (err) {
      errMsg.textContent = `Save failed: ${err.message}`;
      errMsg.style.display = 'block';
    }
  });

  return wrap;
}

// ── Phase controls ───────────────────────────────────────────────────────────

const PHASES = ['game', 'downtime', 'processing'];

async function setGamePhase(cycleId, phase) {
  if (phase === 'game') {
    if (!confirm('Setting to Game phase will reset the live tracker (all characters reload with default states). Continue?')) return false;
    try {
      await apiDelete('/api/tracker_state');
    } catch (err) {
      throw new Error('Tracker reset failed: ' + err.message);
    }
  }
  await apiPut('/api/downtime_cycles/' + cycleId, { game_phase: phase });
  return true;
}

function buildPhaseCell(cy) {
  const td = document.createElement('td');
  td.style.cssText = 'white-space:nowrap';

  const errEl = document.createElement('span');
  errEl.style.cssText = 'color:var(--crim);font-size:11px;display:none;margin-left:6px';
  td.appendChild(errEl);

  PHASES.forEach(phase => {
    const btn = document.createElement('button');
    btn.className = 'btn-sm';
    btn.textContent = PHASE_LABELS[phase];
    btn.dataset.phase = phase;
    btn.style.marginRight = '4px';
    const isActive = cy.game_phase === phase;
    if (isActive) {
      btn.style.borderColor = 'var(--gold2)';
      btn.style.color = 'var(--gold2)';
      btn.disabled = true;
    }
    btn.addEventListener('click', async () => {
      errEl.style.display = 'none';
      try {
        const ok = await setGamePhase(cy._id, phase);
        if (!ok) return;
        cy.game_phase = phase;
        td.querySelectorAll('button[data-phase]').forEach(b => {
          const active = b.dataset.phase === phase;
          b.disabled = active;
          b.style.borderColor = active ? 'var(--gold2)' : '';
          b.style.color = active ? 'var(--gold2)' : '';
        });
      } catch (err) {
        errEl.textContent = 'Phase change failed: ' + err.message;
        errEl.style.display = 'inline';
      }
    });
    td.insertBefore(btn, errEl);
  });

  return td;
}

// ── Prep Access section ──────────────────────────────────────────────────────

function buildAccessSection(cy, charList) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'padding:8px 0 4px;max-height:220px;overflow-y:auto';

  const activeChars = charList
    .filter(c => !c.retired)
    .sort((a, b) => (a.moniker || a.name || '').localeCompare(b.moniker || b.name || ''));

  if (!activeChars.length) {
    wrap.textContent = 'No active characters.';
    wrap.style.color = 'var(--txt2)';
    return wrap;
  }

  const oowIds = new Set((cy.out_of_window_player_ids || []).map(String));

  activeChars.forEach(c => {
    const id = String(c._id);
    const label = document.createElement('label');
    label.style.cssText = 'display:flex;align-items:center;gap:8px;padding:3px 0;cursor:pointer;font-size:13px';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = oowIds.has(id);

    const span = document.createElement('span');
    span.textContent = c.moniker || c.name || String(c._id);

    label.appendChild(cb);
    label.appendChild(span);
    wrap.appendChild(label);

    cb.addEventListener('change', async () => {
      const current = new Set((cy.out_of_window_player_ids || []).map(String));
      if (cb.checked) current.add(id); else current.delete(id);
      const updated = [...current];
      try {
        await apiPut('/api/downtime_cycles/' + cy._id, { out_of_window_player_ids: updated });
        cy.out_of_window_player_ids = updated;
      } catch (_err) {
        cb.checked = !cb.checked;
      }
    });
  });

  return wrap;
}

// ── Game Cycles panel ───────────────────────────────────────────────────────

function buildCyclesPanel(cycles, chapters, charList = []) {
  const sorted = [...cycles].sort((a, b) => (a.game_number ?? 0) - (b.game_number ?? 0));
  const chapterMap = Object.fromEntries(chapters.map(c => [String(c._id), c]));

  const wrap = document.createElement('div');

  const hdr = document.createElement('h3');
  hdr.style.cssText = 'margin:0 0 12px;font-family:Cinzel,serif;font-size:15px;letter-spacing:.04em';
  hdr.textContent = 'Game Cycles';
  wrap.appendChild(hdr);

  if (!sorted.length) {
    const empty = document.createElement('p');
    empty.style.cssText = 'color:var(--txt2);font-size:13px';
    empty.textContent = 'No downtime cycles found.';
    wrap.appendChild(empty);
    return wrap;
  }

  const table = document.createElement('table');
  table.className = 'infl-table';
  table.style.width = '100%';
  table.innerHTML = `<thead><tr>
    <th>Label</th>
    <th style="width:270px">Phase</th>
    <th style="width:200px">Chapter</th>
    <th style="width:110px">Prep Access</th>
  </tr></thead>`;
  const tbody = document.createElement('tbody');

  sorted.forEach(cy => {
    const chapter = cy.chapter_id ? chapterMap[cy.chapter_id] : null;
    const chapterLabel = chapter ? `${chapter.number} — ${chapter.label}` : '—';

    const tr = document.createElement('tr');

    const tdLabel = document.createElement('td');
    tdLabel.textContent = cy.label || cy._id;
    tr.appendChild(tdLabel);

    tr.appendChild(buildPhaseCell(cy));

    const tdChapter = document.createElement('td');
    tdChapter.style.color = 'var(--txt2)';
    tdChapter.textContent = chapterLabel;
    tr.appendChild(tdChapter);

    // Prep Access toggle
    const tdAccess = document.createElement('td');
    const accessBtn = document.createElement('button');
    accessBtn.className = 'btn-sm';
    accessBtn.textContent = 'Prep Access';
    tdAccess.appendChild(accessBtn);
    tr.appendChild(tdAccess);

    // Detail row (hidden by default)
    const detailTr = document.createElement('tr');
    detailTr.style.display = 'none';
    const detailTd = document.createElement('td');
    detailTd.colSpan = 4;
    detailTd.style.cssText = 'padding:4px 12px 12px;background:var(--surf2)';
    detailTd.appendChild(buildAccessSection(cy, charList));
    detailTr.appendChild(detailTd);

    accessBtn.addEventListener('click', () => {
      const open = detailTr.style.display !== 'none';
      detailTr.style.display = open ? 'none' : '';
      accessBtn.style.borderColor = open ? '' : 'var(--gold2)';
      accessBtn.style.color = open ? '' : 'var(--gold2)';
    });

    tbody.appendChild(tr);
    tbody.appendChild(detailTr);
  });

  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}
