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
 * Renders a DicePool object as a display string.
 * Shows expression as-is; appends "· N dice" only when size is known
 * but no "=" total is already present in the expression.
 */
function dicePoolDisplay(pool) {
  if (!pool || !pool.expression) return null;
  const hasStatedTotal = /=/.test(pool.expression);
  if (pool.size != null && !hasStatedTotal) {
    return `${pool.expression} <span style="color:var(--muted)">· ${pool.size} dice</span>`;
  }
  return pool.expression;
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

/**
 * Ordered list of territory matchers.
 * More specific patterns (Northern Shore) must precede their subsets (Shore).
 * Handles common misspellings and abbreviations from freetext player input.
 */
const TERRITORY_MATCHERS = [
  // Academy
  { name: 'The Academy',        re: /academ/i },
  // Harbour -- handles British "harbour", American "harbor", "city harbour"
  { name: 'The Harbour',        re: /harbou?r/i },
  // Docklands -- "docks", "dockland", "docklands"
  { name: 'The Docklands',      re: /\bdocks?\b|dockland/i },
  // Second City -- "second city", "2nd city", "2nd city", "the 2nd"
  { name: 'The Second City',    re: /\b2nd\s+city\b|second\s+city/i },
  // Northern Shore -- must precede generic Shore match
  { name: 'The Northern Shore', re: /north(?:ern)?\s+shore|northern/i },
  // Shore -- bare "shore" after Northern Shore is already handled
  { name: 'The Shore',          re: /\bshore\b/i },
  // Barrens
  { name: 'The Barrens',        re: /\bbarren/i },
];

/**
 * Extracts a canonical territory name from freetext.
 * Tries both the full text and individual sentences/phrases for robustness.
 */
function extractTerritory(text) {
  if (!text) return null;
  for (const { name, re } of TERRITORY_MATCHERS) {
    if (re.test(text)) return name;
  }
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

/**
 * Renders a per-territory ambience score summary grid.
 * +1 per increase-ambience action, -1 per decrease-ambience action.
 * Scans both sphere_actions and projects.
 */
function renderAmbienceScores(rows, container) {
  const scores = {};
  for (const r of rows) {
    if (!r.territory || r.direction === null) continue;
    if (!scores[r.territory]) scores[r.territory] = { inc: 0, dec: 0 };
    if (r.direction === 'increase') scores[r.territory].inc++;
    if (r.direction === 'decrease') scores[r.territory].dec++;
  }

  const scored = Object.entries(scores)
    .filter(([, v]) => v.inc + v.dec > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));

  if (!scored.length) return;

  const title = document.createElement('div');
  title.style.cssText = 'font-family:"Cinzel",serif;font-size:0.7rem;letter-spacing:0.1em;' +
    'color:var(--muted);text-transform:uppercase;margin-bottom:0.75rem';
  title.textContent = 'Ambience Score by Territory';
  container.appendChild(title);

  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));' +
    'gap:0.6rem;margin-bottom:1.75rem';

  for (const [territory, { inc, dec }] of scored) {
    const net      = inc - dec;
    const netColor = net > 0 ? '#7fbf8f' : net < 0 ? 'var(--crim2)' : 'var(--muted)';
    const netStr   = net > 0 ? `+${net}` : String(net);
    const barW     = Math.max(inc, dec) > 0 ? Math.round((Math.abs(net) / Math.max(inc, dec)) * 100) : 0;

    const card = document.createElement('div');
    card.style.cssText =
      'background:var(--surf2);border:1px solid var(--border);border-radius:var(--radius);' +
      'padding:0.6rem 0.75rem;position:relative;overflow:hidden';
    card.innerHTML = `
      <div style="font-family:'Cinzel',serif;font-size:0.68rem;color:var(--gold1);
        letter-spacing:0.06em;margin-bottom:0.45rem;white-space:nowrap;overflow:hidden;
        text-overflow:ellipsis">${territory.replace('The ', '')}</div>
      <div style="display:flex;align-items:baseline;gap:0.6rem">
        <span style="color:#7fbf8f;font-size:0.82rem" title="Increase actions">▲&thinsp;${inc}</span>
        <span style="color:var(--crim2);font-size:0.82rem" title="Decrease actions">▼&thinsp;${dec}</span>
        <span style="color:${netColor};font-family:'Cinzel',serif;font-size:1.15rem;
          font-weight:700;margin-left:auto" title="Net ambience score">${netStr}</span>
      </div>
      <div style="margin-top:0.35rem;height:3px;background:var(--surf3);border-radius:2px">
        <div style="height:100%;width:${barW}%;background:${netColor};border-radius:2px;
          transition:width 0.3s ease"></div>
      </div>`;
    grid.appendChild(card);
  }

  container.appendChild(grid);
}

function renderTerritoryActions(submissions, container) {
  container.innerHTML = '';

  // Collect sphere actions with territory + direction
  const rows = [];
  for (const s of submissions) {
    for (const a of s.sphere_actions) {
      const territory = extractTerritory(a.desired_outcome) ||
                        extractTerritory(a.description) || null;
      const direction = ambienceDirection(a.action_type);
      const category  = actionCategory(a.action_type);
      rows.push({
        source: 'sphere',
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
    // Also pull projects that have an ambience direction in their action_type
    for (const p of s.projects) {
      const direction = ambienceDirection(p.action_type);
      if (!direction) continue;
      const territory = extractTerritory(p.desired_outcome) ||
                        extractTerritory(p.description) || null;
      rows.push({
        source: 'project',
        character: s.submission.character_name,
        merit_type: '(Project)',
        action_type: p.action_type,
        desired_outcome: p.desired_outcome,
        description: p.description,
        territory,
        direction,
        category: 'ambience',
      });
    }
  }

  if (!rows.length) {
    container.innerHTML = '<p style="color:var(--muted);font-size:0.85rem">No sphere actions this cycle.</p>';
    return;
  }

  // Ambience score summary at the top
  renderAmbienceScores(rows, container);

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

    const srcTag = (r) => r.source === 'project'
      ? '<span style="font-size:0.65rem;color:var(--muted);vertical-align:super;margin-left:0.2rem">proj</span>'
      : '';

    const typeLabel = (r) => {
      if (r.direction === 'increase') return `<span style="color:#7fbf8f">▲ Increase${srcTag(r)}</span>`;
      if (r.direction === 'decrease') return `<span style="color:var(--crim2)">▼ Decrease${srcTag(r)}</span>`;
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

// ── Players panel ─────────────────────────────────────────────────────────────

function renderPlayerMenu(submissions, menuContainer, detailContainer) {
  menuContainer.innerHTML = '';

  const sorted = [...submissions].sort((a, b) =>
    a.submission.character_name.localeCompare(b.submission.character_name)
  );

  let firstBtn = null;

  for (const s of sorted) {
    const btn = document.createElement('button');
    btn.className = 'player-menu-item';
    const attended = s.submission.attended_last_game;
    btn.innerHTML = `
      <span class="char-name">${s.submission.character_name}</span>
      <span class="player-name">${s.submission.player_name}</span>
      <span class="attended-badge ${attended ? 'yes' : 'no'}"
        style="font-size:0.58rem;margin-top:0.2rem">${attended ? 'Attended' : 'Absent'}</span>`;

    btn.addEventListener('click', () => {
      menuContainer.querySelectorAll('.player-menu-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderPlayerDetail(s, detailContainer);
    });

    menuContainer.appendChild(btn);
    if (!firstBtn) firstBtn = btn;
  }

  if (firstBtn) firstBtn.click();
}

function renderPlayerDetail(s, container) {
  container.innerHTML = '';

  // Header
  const header = document.createElement('div');
  header.className = 'player-detail-header';
  const attended = s.submission.attended_last_game;
  header.innerHTML = `
    <div>
      <div class="char-name">${s.submission.character_name}</div>
      <div class="player-name">${s.submission.player_name}</div>
    </div>
    <span class="attended-badge ${attended ? 'yes' : 'no'}">${attended ? 'Attended' : 'Absent'}</span>`;
  container.appendChild(header);

  // Helper: create a <details> collapsible section
  function section(title, count, renderFn, openByDefault) {
    const el = document.createElement('details');
    if (openByDefault) el.open = true;
    el.className = 'player-section';

    const sum = document.createElement('summary');
    sum.innerHTML = `${title}
      ${count != null ? `<span class="player-section-count">${count}</span>` : ''}`;
    el.appendChild(sum);

    const body = document.createElement('div');
    body.className = 'player-section-body';
    renderFn(body);
    el.appendChild(body);
    container.appendChild(el);
  }

  // ── Projects ──
  if (s.projects.length) {
    section('Projects', s.projects.length, body => {
      for (const p of s.projects) {
        const div = document.createElement('div');
        div.className = 'action-item';
        const primDisplay = dicePoolDisplay(p.primary_pool);
        const secDisplay  = dicePoolDisplay(p.secondary_pool);
        div.innerHTML = `
          <div class="action-type">${cleanActionType(p.action_type)}</div>
          ${primDisplay ? `<div class="action-pool">Pool: ${primDisplay}</div>` : ''}
          ${secDisplay  ? `<div class="action-pool" style="color:var(--muted)">Secondary: ${secDisplay}</div>` : ''}
          ${p.desired_outcome ? `<div class="action-outcome">${p.desired_outcome}</div>` : ''}
          ${p.description     ? `<div class="action-desc">${p.description}</div>` : ''}`;
        body.appendChild(div);
      }
    }, true);
  }

  // ── Sphere Actions ──
  if (s.sphere_actions.length) {
    section('Sphere Actions', s.sphere_actions.length, body => {
      for (const a of s.sphere_actions) {
        const dir = ambienceDirection(a.action_type);
        const dirBadge = dir === 'increase'
          ? '<span style="color:#7fbf8f;font-size:0.7rem">▲ Increase</span>'
          : dir === 'decrease'
          ? '<span style="color:var(--crim2);font-size:0.7rem">▼ Decrease</span>'
          : '';
        const div = document.createElement('div');
        div.className = 'action-item';
        div.innerHTML = `
          <div class="action-type" style="display:flex;justify-content:space-between;align-items:center">
            <span>${cleanActionType(a.action_type)}</span>${dirBadge}
          </div>
          <div class="action-merit">${a.merit_type}</div>
          ${a.desired_outcome ? `<div class="action-outcome">${a.desired_outcome}</div>` : ''}
          ${a.description     ? `<div class="action-desc">${a.description}</div>` : ''}`;
        body.appendChild(div);
      }
    }, true);
  }

  // ── Contacts ──
  if (s.contact_actions.requests.length) {
    section('Contacts', s.contact_actions.requests.length, body => {
      for (const req of s.contact_actions.requests) {
        const div = document.createElement('div');
        div.className = 'action-item';
        div.innerHTML = `<div class="action-desc">${req}</div>`;
        body.appendChild(div);
      }
    });
  }

  // ── Retainers ──
  if (s.retainer_actions.actions.length) {
    section('Retainers', s.retainer_actions.actions.length, body => {
      for (const act of s.retainer_actions.actions) {
        const div = document.createElement('div');
        div.className = 'action-item';
        div.innerHTML = `<div class="action-desc">${act}</div>`;
        body.appendChild(div);
      }
    });
  }

  // ── Acquisitions ──
  if (s.acquisitions.has_acquisitions) {
    section('Acquisitions', null, body => {
      if (s.acquisitions.resource_acquisitions) {
        const div = document.createElement('div');
        div.className = 'action-item';
        div.innerHTML = `<div class="action-type">Resources</div>
          <div class="action-desc">${s.acquisitions.resource_acquisitions}</div>`;
        body.appendChild(div);
      }
      if (s.acquisitions.skill_acquisitions) {
        const div = document.createElement('div');
        div.className = 'action-item';
        div.innerHTML = `<div class="action-type">Skills</div>
          <div class="action-desc">${s.acquisitions.skill_acquisitions}</div>`;
        body.appendChild(div);
      }
    });
  }

  // ── Ritual Casting ──
  if (s.ritual_casting.has_rituals) {
    section('Ritual Casting', null, body => {
      const div = document.createElement('div');
      div.className = 'action-item';
      div.innerHTML = `<div class="action-desc">${s.ritual_casting.casting || '(no detail provided)'}</div>`;
      body.appendChild(div);
    });
  }

  // ── Regency ──
  if (s.regency.is_regent) {
    section('Regency', null, body => {
      const div = document.createElement('div');
      div.className = 'action-item';
      let html = `<div class="action-type">${s.regency.territory || '(unknown territory)'}</div>`;
      if (s.regency.regency_action) html += `<div class="action-desc">${s.regency.regency_action}</div>`;
      if (s.regency.residency_grants.length) {
        html += `<div class="action-pool" style="margin-top:0.35rem">Residency grants: ${s.regency.residency_grants.join(', ')}</div>`;
      }
      div.innerHTML = html;
      body.appendChild(div);
    });
  }

  // ── Narrative ──
  const narrativeFields = [
    ['Game Recount',    s.narrative.game_recount],
    ['Travel',          s.narrative.travel_description],
    ['IC Correspondence', s.narrative.ic_correspondence],
    ['Aspirations',     s.narrative.aspirations],
    ['Most Trusted',    s.narrative.most_trusted_pc],
    ['Actively Harming',s.narrative.actively_harming_pc],
    ['Standout RP',     s.narrative.standout_rp],
  ].filter(([, v]) => v);

  if (narrativeFields.length) {
    section('Narrative', null, body => {
      for (const [label, val] of narrativeFields) {
        const div = document.createElement('div');
        div.className = 'action-item';
        div.innerHTML = `<div class="action-type">${label}</div>
          <div class="action-desc">${val}</div>`;
        body.appendChild(div);
      }
    });
  }

  // ── ST Notes & Meta ──
  const metaFields = [
    ['ST Notes',       s.meta.st_notes],
    ['XP Spend',       s.meta.xp_spend],
    ['Lore Questions', s.meta.lore_questions],
  ].filter(([, v]) => v);

  if (metaFields.length) {
    section('ST Notes & Meta', null, body => {
      for (const [label, val] of metaFields) {
        const div = document.createElement('div');
        div.className = 'action-item';
        div.innerHTML = `<div class="action-type">${label}</div>
          <div class="action-desc">${val}</div>`;
        body.appendChild(div);
      }
    });
  }
}

// ── Tab switching ─────────────────────────────────────────────────────────────

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });
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
  // Summary tab
  renderStats(      submissions, document.getElementById('stat-grid'));
  renderBreakdowns( submissions, document.getElementById('breakdown-grid'));
  initSearch(submissions);

  // Territories tab
  renderTerritoryActions(submissions, document.getElementById('territory-actions-section'));
  renderTerritoryTable(  submissions, document.getElementById('territory-section'));

  // Players tab
  renderPlayerMenu(
    submissions,
    document.getElementById('player-menu'),
    document.getElementById('player-detail')
  );

  initTabs();
  document.getElementById('dashboard').style.display = 'block';
}
