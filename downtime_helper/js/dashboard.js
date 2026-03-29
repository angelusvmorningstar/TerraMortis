/**
 * dashboard.js
 * Renders summary statistics and per-character cards from parsed downtime submissions.
 */

// ── Stat cards ────────────────────────────────────────────────────────────────

function statCard(value, label, highlight = false) {
  const div = document.createElement('div');
  div.className = 'stat-card' + (highlight ? ' highlight' : '');
  div.innerHTML = `<div class="stat-value">${value}</div><div class="stat-label">${label}</div>`;
  return div;
}

function renderStats(submissions, container) {
  container.innerHTML = '';

  const total     = submissions.length;
  const attended  = submissions.filter(s => s.submission.attended_last_game).length;
  const regents   = submissions.filter(s => s.regency.is_regent).length;

  const totalProjects = submissions.reduce((n, s) => n + s.projects.length, 0);
  const totalSphere   = submissions.reduce((n, s) => n + s.sphere_actions.length, 0);
  const totalContacts = submissions.reduce((n, s) => n + s.contact_actions.requests.length, 0);
  const totalRetainers= submissions.reduce((n, s) => n + s.retainer_actions.actions.length, 0);
  const totalRituals  = submissions.filter(s => s.ritual_casting.has_rituals).length;
  const totalAcq      = submissions.filter(s => s.acquisitions.has_acquisitions).length;
  const totalActions  = totalProjects + totalSphere + totalContacts + totalRetainers;

  container.appendChild(statCard(total,         'Submissions',       true));
  container.appendChild(statCard(attended,       'Attended Last Game'));
  container.appendChild(statCard(total - attended, 'Absent'));
  container.appendChild(statCard(regents,        'Regents'));
  container.appendChild(statCard(totalActions,   'Total Actions',     true));
  container.appendChild(statCard(totalProjects,  'Projects'));
  container.appendChild(statCard(totalSphere,    'Sphere Actions'));
  container.appendChild(statCard(totalContacts,  'Contact Requests'));
  container.appendChild(statCard(totalRetainers, 'Retainer Tasks'));
  container.appendChild(statCard(totalRituals,   'Ritual Casters'));
  container.appendChild(statCard(totalAcq,       'Acquisitions'));
}

// ── Breakdown cards ───────────────────────────────────────────────────────────

function countBy(arr, keyFn) {
  const map = {};
  for (const item of arr) {
    const key = keyFn(item) || '(unspecified)';
    map[key] = (map[key] || 0) + 1;
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

/**
 * Strips emoji and ":" suffix from action type labels for cleaner display.
 */
function cleanActionType(s) {
  return s
    .replace(/[\u{1F300}-\u{1FFFF}]/gu, '')  // remove emoji
    .replace(/\s*:\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .split(':')[0]  // keep only the short name before first colon
    .trim();
}

function breakdownCard(title, entries, total) {
  const card = document.createElement('div');
  card.className = 'breakdown-card';
  card.innerHTML = `<h4>${title}</h4>`;

  if (!entries.length) {
    card.innerHTML += '<p style="color:var(--muted);font-size:0.8rem">None</p>';
    return card;
  }

  for (const [label, count] of entries) {
    const pct = total ? Math.round((count / total) * 100) : 0;
    const row = document.createElement('div');
    row.className = 'breakdown-row';
    row.innerHTML = `
      <div style="flex:1">
        <div style="display:flex;justify-content:space-between">
          <span class="label">${cleanActionType(label)}</span>
          <span class="count">${count}</span>
        </div>
        <div class="breakdown-bar"><div class="breakdown-bar-fill" style="width:${pct}%"></div></div>
      </div>`;
    card.appendChild(row);
  }

  return card;
}

function contactType(request) {
  // Requests are freetext but typically start with "Contact Type: POLICE\n..."
  const m = request.match(/contact\s+type\s*:\s*([^\n]+)/i);
  return m ? m[1].trim() : '(unspecified)';
}

function renderBreakdowns(submissions, container) {
  container.innerHTML = '';

  const allProjects  = submissions.flatMap(s => s.projects);
  const allSphere    = submissions.flatMap(s => s.sphere_actions);
  const allContacts  = submissions.flatMap(s => s.contact_actions.requests);

  const projectTypes  = countBy(allProjects, p => p.action_type);
  const sphereTypes   = countBy(allSphere,   p => p.action_type);
  const meritTypes    = countBy(allSphere,   p => p.merit_type.replace(/\s+\d+\s*/, ' ').trim());
  const contactTypes  = countBy(allContacts, contactType);

  container.appendChild(breakdownCard('Project Action Types',  projectTypes, allProjects.length));
  container.appendChild(breakdownCard('Sphere Action Types',   sphereTypes,  allSphere.length));
  container.appendChild(breakdownCard('Sphere Merit Types',    meritTypes,   allSphere.length));
  container.appendChild(breakdownCard('Contact Enquiries',     contactTypes, allContacts.length));
}

// ── Territory table ───────────────────────────────────────────────────────────

const FEED_TERRITORIES = [
  'The Academy', 'The City Harbour', 'The Docklands',
  'The Second City', 'The Northern Shore', 'The Barrens'
];

const INF_TERRITORIES = [
  'The Academy', 'The Harbour', 'The Docklands', 'The Second City', 'The Shore'
];

function feedBadge(status) {
  if (!status || status === 'Not feeding here') {
    return '<span class="feed-badge none">--</span>';
  }
  const cls = status.toLowerCase();
  return `<span class="feed-badge ${cls}">${status}</span>`;
}

function renderTerritoryTable(submissions, container) {
  container.innerHTML = '';

  // ── Feeding table ──
  const feedTitle = document.createElement('h4');
  feedTitle.className = 'section-title';
  feedTitle.textContent = 'Feeding Activity by Character';
  container.appendChild(feedTitle);

  const feedTable = document.createElement('table');
  feedTable.className = 'territory-table';

  const feedHead = document.createElement('thead');
  feedHead.innerHTML = `<tr>
    <th>Character</th>
    ${FEED_TERRITORIES.map(t => `<th>${t.replace('The ', '')}</th>`).join('')}
  </tr>`;
  feedTable.appendChild(feedHead);

  const feedBody = document.createElement('tbody');
  for (const s of submissions) {
    const tr = document.createElement('tr');
    const terr = s.feeding.territories;
    tr.innerHTML = `
      <td><span style="font-family:'Cinzel',serif;font-size:0.85rem">${s.submission.character_name}</span></td>
      ${FEED_TERRITORIES.map(t => `<td>${feedBadge(terr[t])}</td>`).join('')}
    `;
    feedBody.appendChild(tr);
  }
  feedTable.appendChild(feedBody);
  container.appendChild(feedTable);

  // ── Influence table ──
  const infTitle = document.createElement('h4');
  infTitle.className = 'section-title';
  infTitle.style.marginTop = '1.5rem';
  infTitle.textContent = 'Influence Spending';
  container.appendChild(infTitle);

  // Totals per territory
  const totals = {};
  for (const t of INF_TERRITORIES) totals[t] = 0;
  for (const s of submissions) {
    for (const t of INF_TERRITORIES) {
      totals[t] += s.influence[t] || 0;
    }
  }

  const infTable = document.createElement('table');
  infTable.className = 'territory-table';
  infTable.innerHTML = `
    <thead><tr>
      <th>Character</th>
      ${INF_TERRITORIES.map(t => `<th>${t.replace('The ', '')}</th>`).join('')}
    </tr></thead>
    <tbody>
      ${submissions.map(s => `<tr>
        <td><span style="font-family:'Cinzel',serif;font-size:0.85rem">${s.submission.character_name}</span></td>
        ${INF_TERRITORIES.map(t => {
          const v = s.influence[t] || 0;
          return `<td style="text-align:center;color:${v > 0 ? 'var(--gold2)' : 'var(--surf4)'}">${v > 0 ? v : '--'}</td>`;
        }).join('')}
      </tr>`).join('')}
      <tr style="border-top:1px solid var(--gold1)">
        <td style="font-family:'Cinzel',serif;font-size:0.75rem;color:var(--gold1)">TOTAL</td>
        ${INF_TERRITORIES.map(t => `<td style="text-align:center;font-family:'Cinzel',serif;color:var(--gold2)">${totals[t] || '--'}</td>`).join('')}
      </tr>
    </tbody>`;
  container.appendChild(infTable);
}

// ── Character cards ───────────────────────────────────────────────────────────

function renderCharCards(submissions, container) {
  container.innerHTML = '';

  // Attended first, then absent
  const sorted = [...submissions].sort((a, b) => {
    if (a.submission.attended_last_game === b.submission.attended_last_game) {
      return a.submission.character_name.localeCompare(b.submission.character_name);
    }
    return a.submission.attended_last_game ? -1 : 1;
  });

  for (const s of sorted) {
    const card = document.createElement('div');
    card.className = 'char-card' + (s.submission.attended_last_game ? '' : ' absent');

    const attendedBadge = s.submission.attended_last_game
      ? '<span class="attended-badge yes">Attended</span>'
      : '<span class="attended-badge no">Absent</span>';

    const regentPill = s.regency.is_regent
      ? `<span class="meta-pill regent">Regent: ${s.regency.territory || '?'}</span>`
      : '';

    const projCount    = s.projects.length;
    const sphereCount  = s.sphere_actions.length;
    const contactCount = s.contact_actions.requests.length;
    const retainCount  = s.retainer_actions.actions.length;
    const hasRitual    = s.ritual_casting.has_rituals;
    const hasAcq       = s.acquisitions.has_acquisitions;

    const xpLine = s.meta.xp_spend
      ? `<span class="meta-pill">XP<span>${s.meta.xp_spend.replace(/\n.*/s, '').trim().slice(0, 40)}</span></span>`
      : '';

    card.innerHTML = `
      <div class="char-card-header">
        <div>
          <div class="char-name">${s.submission.character_name}</div>
          <div class="player-name">${s.submission.player_name}</div>
        </div>
        ${attendedBadge}
      </div>
      <div class="char-meta">
        ${regentPill}
        ${projCount    ? `<span class="meta-pill">Projects<span>${projCount}</span></span>` : ''}
        ${sphereCount  ? `<span class="meta-pill">Sphere<span>${sphereCount}</span></span>` : ''}
        ${contactCount ? `<span class="meta-pill">Contacts<span>${contactCount}</span></span>` : ''}
        ${retainCount  ? `<span class="meta-pill">Retainers<span>${retainCount}</span></span>` : ''}
        ${hasRitual    ? `<span class="meta-pill">Ritual</span>` : ''}
        ${hasAcq       ? `<span class="meta-pill">Acquisition</span>` : ''}
        ${xpLine}
      </div>
    `;
    container.appendChild(card);
  }
}

// ── Territory actions ─────────────────────────────────────────────────────────

const TERRITORY_NAMES = [
  'Academy', 'Harbour', 'Docklands', 'Second City', 'Northern Shore', 'Shore', 'Barrens'
];

function extractTerritory(text) {
  if (!text) return null;
  const u = text.toUpperCase();
  if (u.includes('ACADEMY'))      return 'The Academy';
  if (u.includes('HARBOUR'))      return 'The Harbour';
  if (u.includes('DOCKLAND'))     return 'The Docklands';
  if (u.includes('SECOND'))       return 'The Second City';
  if (u.includes('NORTHERN') || (u.includes('SHORE') && u.includes('NORTH'))) return 'The Northern Shore';
  if (u.includes('SHORE'))        return 'The Shore';
  if (u.includes('BARREN'))       return 'The Barrens';
  return null;
}

function ambienceDirection(actionType) {
  if (/increase/i.test(actionType)) return 'increase';
  if (/decrease/i.test(actionType)) return 'decrease';
  return null;
}

function actionCategory(actionType) {
  if (/ambience/i.test(actionType))         return 'ambience';
  if (/patrol|scout/i.test(actionType))     return 'patrol';
  if (/acquisition/i.test(actionType))      return 'acquisition';
  if (/diplomatic/i.test(actionType))       return 'diplomatic';
  if (/information/i.test(actionType))      return 'information';
  return 'other';
}

function renderTerritoryActions(submissions, container) {
  container.innerHTML = '';

  // Collect all sphere actions with territory + direction
  const rows = [];
  for (const s of submissions) {
    for (const a of s.sphere_actions) {
      const territory = extractTerritory(a.desired_outcome) ||
                        extractTerritory(a.description) || null;
      const direction = ambienceDirection(a.action_type);
      const category  = actionCategory(a.action_type);
      rows.push({
        character: s.submission.character_name,
        merit_type: a.merit_type,
        action_type: a.action_type,
        desired_outcome: a.desired_outcome,
        description: a.description,
        territory,
        direction,
        category,
      });
    }
  }

  if (!rows.length) {
    container.innerHTML = '<p style="color:var(--muted);font-size:0.85rem">No sphere actions this cycle.</p>';
    return;
  }

  // Group by territory, then by direction/category
  const byTerritory = {};
  const noTerritory = [];

  for (const r of rows) {
    if (r.territory) {
      if (!byTerritory[r.territory]) byTerritory[r.territory] = [];
      byTerritory[r.territory].push(r);
    } else {
      noTerritory.push(r);
    }
  }

  // Render each territory block
  for (const [territory, actions] of Object.entries(byTerritory).sort()) {
    const increases = actions.filter(a => a.direction === 'increase');
    const decreases = actions.filter(a => a.direction === 'decrease');
    const patrols   = actions.filter(a => a.category  === 'patrol');
    const others    = actions.filter(a => a.direction === null && a.category !== 'patrol');

    const block = document.createElement('div');
    block.style.cssText = 'margin-bottom:1.5rem';

    block.innerHTML = `<h4 style="font-family:'Cinzel',serif;font-size:0.8rem;letter-spacing:0.08em;
      color:var(--gold2);margin-bottom:0.6rem;text-transform:uppercase">${territory}</h4>`;

    const table = document.createElement('table');
    table.className = 'territory-table';
    table.innerHTML = `<thead><tr>
      <th>Type</th><th>Character</th><th>Merit</th><th>Desired Outcome</th>
    </tr></thead>`;

    const tbody = document.createElement('tbody');

    const typeLabel = (r) => {
      if (r.direction === 'increase') return '<span style="color:#7fbf8f">▲ Increase</span>';
      if (r.direction === 'decrease') return '<span style="color:var(--crim2)">▼ Decrease</span>';
      if (r.category  === 'patrol')   return '<span style="color:var(--gold1)">👁 Patrol</span>';
      if (r.category  === 'acquisition') return '<span style="color:#8ab4d4">Acquisition</span>';
      return `<span style="color:var(--muted)">${cleanActionType(r.action_type)}</span>`;
    };

    for (const r of [...increases, ...decreases, ...patrols, ...others]) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${typeLabel(r)}</td>
        <td style="font-family:'Cinzel',serif;font-size:0.8rem">${r.character}</td>
        <td style="font-size:0.78rem;color:var(--muted)">${r.merit_type}</td>
        <td style="font-size:0.82rem">${r.desired_outcome || '--'}</td>`;
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    block.appendChild(table);
    container.appendChild(block);
  }

  // Unassigned territory block
  if (noTerritory.length) {
    const block = document.createElement('div');
    block.innerHTML = `<h4 style="font-family:'Cinzel',serif;font-size:0.8rem;letter-spacing:0.08em;
      color:var(--muted);margin-bottom:0.6rem;text-transform:uppercase">No Territory Identified</h4>`;
    const table = document.createElement('table');
    table.className = 'territory-table';
    table.innerHTML = `<thead><tr><th>Action Type</th><th>Character</th><th>Merit</th><th>Desired Outcome</th></tr></thead>`;
    const tbody = document.createElement('tbody');
    for (const r of noTerritory) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="color:var(--muted);font-size:0.8rem">${cleanActionType(r.action_type)}</td>
        <td style="font-family:'Cinzel',serif;font-size:0.8rem">${r.character}</td>
        <td style="font-size:0.78rem;color:var(--muted)">${r.merit_type}</td>
        <td style="font-size:0.82rem">${r.desired_outcome || '--'}</td>`;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    block.appendChild(table);
    container.appendChild(block);
  }
}

// ── Action search ─────────────────────────────────────────────────────────────

let _searchSubmissions = [];

function initSearch(submissions) {
  _searchSubmissions = submissions;
  const input  = document.getElementById('search-input');
  const filter = document.getElementById('search-filter');
  const runSearch = () => renderSearchResults(input.value.trim(), filter.value);
  input.addEventListener('input', runSearch);
  filter.addEventListener('change', runSearch);
}

function renderSearchResults(query, filter) {
  const container = document.getElementById('search-results');
  container.innerHTML = '';

  if (!query && filter === 'all') {
    container.innerHTML = '<p style="color:var(--muted);font-size:0.85rem">Type to search across all actions.</p>';
    return;
  }

  const q = query.toLowerCase();
  const results = [];

  for (const s of _searchSubmissions) {
    const char = s.submission.character_name;

    const matchesText = (text) => !q || (text || '').toLowerCase().includes(q);

    // Projects
    if (filter === 'all' || filter === 'projects') {
      for (const p of s.projects) {
        if (matchesText(p.action_type) || matchesText(p.desired_outcome) || matchesText(p.description)) {
          results.push({ kind: 'project', char, data: p });
        }
      }
    }

    // Sphere actions
    if (filter === 'all' || filter === 'sphere' || filter === 'ambience' || filter === 'patrol') {
      for (const a of s.sphere_actions) {
        const cat = actionCategory(a.action_type);
        if (filter === 'ambience' && cat !== 'ambience') continue;
        if (filter === 'patrol'   && cat !== 'patrol')   continue;
        if (matchesText(a.action_type) || matchesText(a.desired_outcome) ||
            matchesText(a.description) || matchesText(a.merit_type)) {
          results.push({ kind: 'sphere', char, data: a });
        }
      }
    }

    // Contacts
    if (filter === 'all' || filter === 'contacts') {
      for (const req of s.contact_actions.requests) {
        if (matchesText(req)) {
          results.push({ kind: 'contact', char, data: req });
        }
      }
    }
  }

  if (!results.length) {
    container.innerHTML = '<p style="color:var(--muted);font-size:0.85rem">No matching actions.</p>';
    return;
  }

  const kindColour = { project: 'var(--gold1)', sphere: '#7fbf8f', contact: '#8ab4d4' };
  const kindLabel  = { project: 'Project', sphere: 'Sphere', contact: 'Contact' };

  const table = document.createElement('table');
  table.className = 'territory-table';
  table.innerHTML = `<thead><tr><th>Type</th><th>Character</th><th>Action / Merit</th><th>Desired Outcome / Request</th></tr></thead>`;
  const tbody = document.createElement('tbody');

  for (const r of results) {
    const tr = document.createElement('tr');
    if (r.kind === 'contact') {
      const m = r.data.match(/contact\s+type\s*:\s*([^\n]+)/i);
      tr.innerHTML = `
        <td><span style="color:${kindColour.contact};font-family:'Cinzel',serif;font-size:0.7rem">${kindLabel.contact}</span></td>
        <td style="font-family:'Cinzel',serif;font-size:0.8rem">${r.char}</td>
        <td style="font-size:0.78rem;color:var(--muted)">${m ? m[1].trim() : '(unspecified)'}</td>
        <td style="font-size:0.82rem">${r.data.replace(/\n.*/s, '').trim()}</td>`;
    } else if (r.kind === 'sphere') {
      tr.innerHTML = `
        <td><span style="color:${kindColour.sphere};font-family:'Cinzel',serif;font-size:0.7rem">${kindLabel.sphere}</span></td>
        <td style="font-family:'Cinzel',serif;font-size:0.8rem">${r.char}</td>
        <td style="font-size:0.78rem;color:var(--muted)">${r.data.merit_type}<br>
          <span style="color:var(--text)">${cleanActionType(r.data.action_type)}</span></td>
        <td style="font-size:0.82rem">${r.data.desired_outcome || '--'}</td>`;
    } else {
      tr.innerHTML = `
        <td><span style="color:${kindColour.project};font-family:'Cinzel',serif;font-size:0.7rem">${kindLabel.project}</span></td>
        <td style="font-family:'Cinzel',serif;font-size:0.8rem">${r.char}</td>
        <td style="font-size:0.78rem;color:var(--text)">${cleanActionType(r.data.action_type)}</td>
        <td style="font-size:0.82rem">${r.data.desired_outcome || '--'}</td>`;
    }
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  const count = document.createElement('p');
  count.style.cssText = 'font-family:"Cinzel",serif;font-size:0.7rem;color:var(--muted);margin-bottom:0.5rem';
  count.textContent = `${results.length} result${results.length !== 1 ? 's' : ''}`;
  container.appendChild(count);
  container.appendChild(table);
}

// ── Public API ────────────────────────────────────────────────────────────────

function renderDashboard(submissions) {
  renderStats(           submissions, document.getElementById('stat-grid'));
  renderBreakdowns(      submissions, document.getElementById('breakdown-grid'));
  renderTerritoryActions(submissions, document.getElementById('territory-actions-section'));
  renderTerritoryTable(  submissions, document.getElementById('territory-section'));
  renderCharCards(       submissions, document.getElementById('char-grid'));
  initSearch(submissions);
  document.getElementById('dashboard').style.display = 'block';
}
