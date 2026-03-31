/**
 * Downtime domain views — admin app.
 * CSV upload, cycle management, submission overview, character bridge, feeding rolls.
 */

import { apiGet } from '../data/api.js';
import { parseDowntimeCSV } from '../downtime/parser.js';
import { getActiveCycle, createCycle, getSubmissionsForCycle, upsertCycle, updateSubmission } from '../downtime/db.js';
import { rollPool } from '../downtime/roller.js';
import { getAttrVal, getSkillObj } from '../data/accessors.js';

let submissions = [];
let characters = [];
let charMap = new Map();
let activeCycle = null;
let expandedId = null;

export async function initDowntimeView() {
  const container = document.getElementById('downtime-content');
  if (!container) return;

  container.innerHTML = buildShell();

  document.getElementById('dt-file-input').addEventListener('change', handleFileSelect);
  document.getElementById('dt-drop-zone').addEventListener('dragover', e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); });
  document.getElementById('dt-drop-zone').addEventListener('dragleave', e => { e.currentTarget.classList.remove('drag-over'); });
  document.getElementById('dt-drop-zone').addEventListener('drop', handleDrop);
  document.getElementById('dt-new-cycle').addEventListener('click', handleNewCycle);
  await loadCharacters();
  await loadActiveCycle();
}

function buildShell() {
  return `
    <div class="dt-toolbar">
      <div id="dt-drop-zone" class="dt-drop-zone">
        <span>Drop CSV here or </span>
        <label class="dt-file-label">
          choose file<input type="file" id="dt-file-input" accept=".csv" style="display:none">
        </label>
      </div>
      <button class="dt-btn" id="dt-new-cycle">New Cycle</button>
    </div>
    <div id="dt-cycle-info" class="dt-cycle-info"></div>
    <div id="dt-warnings" class="dt-warnings"></div>
    <div id="dt-match-summary"></div>
    <div id="dt-submissions" class="dt-submissions"></div>`;
}

// ── Character data bridge ───────────────────────────────────────────────────

async function loadCharacters() {
  try {
    characters = await apiGet('/api/characters');
    charMap = new Map(characters.map(c => [(c.name || '').toLowerCase().trim(), c]));
  } catch {
    characters = [];
    charMap = new Map();
  }
}

export function findCharacter(submissionName) {
  if (!submissionName) return null;
  return charMap.get(submissionName.toLowerCase().trim()) || null;
}

const FEED_METHODS = [
  { id: 'seduction', name: 'Seduction', attrs: ['Presence', 'Manipulation'], skills: ['Empathy', 'Socialise', 'Persuasion'] },
  { id: 'stalking', name: 'Stalking', attrs: ['Dexterity', 'Wits'], skills: ['Stealth', 'Athletics'] },
  { id: 'force', name: 'By Force', attrs: ['Strength'], skills: ['Brawl', 'Weaponry'] },
  { id: 'familiar', name: 'Familiar Face', attrs: ['Manipulation', 'Presence'], skills: ['Persuasion', 'Subterfuge'] },
  { id: 'intimidation', name: 'Intimidation', attrs: ['Strength', 'Manipulation'], skills: ['Intimidation', 'Subterfuge'] },
];

function buildFeedingPool(char, methodId, ambienceMod) {
  if (!char) return null;
  const method = FEED_METHODS.find(m => m.id === methodId);
  if (!method) return null;

  let bestAttr = 0, bestAttrName = '';
  for (const a of method.attrs) {
    const v = getAttrVal(char, a);
    if (v > bestAttr) { bestAttr = v; bestAttrName = a; }
  }

  let bestSkill = 0, bestSkillName = '';
  for (const s of method.skills) {
    const sk = getSkillObj(char, s);
    const v = sk.dots + (sk.bonus || 0);
    if (v > bestSkill) { bestSkill = v; bestSkillName = s; }
  }

  const fg = (char.merits || []).find(m => m.name === 'Feeding Grounds');
  const fgVal = fg ? (fg.rating || 0) : 0;
  const amb = ambienceMod || 0;
  const total = Math.max(0, bestAttr + bestSkill + fgVal + amb);

  return {
    total,
    breakdown: { attr: bestAttrName, attrVal: bestAttr, skill: bestSkillName, skillVal: bestSkill, fg: fgVal, ambience: amb },
  };
}

// ── Cycle loading ───────────────────────────────────────────────────────────

async function loadActiveCycle() {
  const infoEl = document.getElementById('dt-cycle-info');
  const subEl = document.getElementById('dt-submissions');

  activeCycle = await getActiveCycle();
  if (!activeCycle) {
    infoEl.innerHTML = '<span class="placeholder">No active cycle. Upload a CSV or create a new cycle.</span>';
    subEl.innerHTML = '';
    document.getElementById('dt-match-summary').innerHTML = '';
    return;
  }

  infoEl.innerHTML = `<span class="dt-cycle-label">${esc(activeCycle.label || 'Active Cycle')}</span>
    <span class="domain-count">${activeCycle.submission_count || 0} submissions</span>`;

  submissions = await getSubmissionsForCycle(activeCycle._id);
  renderMatchSummary();
  renderSubmissions();
}

// ── Match summary ───────────────────────────────────────────────────────────

function renderMatchSummary() {
  const el = document.getElementById('dt-match-summary');
  if (!submissions.length) { el.innerHTML = ''; return; }

  const matched = submissions.filter(s => findCharacter(s.character_name));
  const unmatched = submissions.filter(s => !findCharacter(s.character_name));
  const rolled = submissions.filter(s => s.feeding_roll);

  let h = '<div class="dt-match-bar">';
  h += `<span class="dt-match-ok">${matched.length} matched</span>`;
  h += `<span class="domain-count">${rolled.length}/${submissions.length} feeding rolled</span>`;
  if (unmatched.length) {
    h += `<span class="dt-match-warn">${unmatched.length} unmatched: ${unmatched.map(s => esc(s.character_name || '?')).join(', ')}</span>`;
  }
  h += '</div>';
  el.innerHTML = h;
}

// ── Submission rendering ────────────────────────────────────────────────────

function renderSubmissions() {
  const el = document.getElementById('dt-submissions');
  if (!submissions.length) {
    el.innerHTML = '<p class="placeholder">No submissions in this cycle.</p>';
    return;
  }

  const sorted = [...submissions].sort((a, b) => (a.character_name || '').localeCompare(b.character_name || ''));

  el.innerHTML = '<div class="dt-sub-list">' + sorted.map(s => {
    const raw = s._raw || {};
    const sub = raw.submission || {};
    const projects = (raw.projects || []).length;
    const spheres = (raw.sphere_actions || []).length;
    const feedMethod = raw.feeding?.method || '';
    const attended = sub.attended_last_game ? '\u2713' : '\u2717';
    const attendedClass = sub.attended_last_game ? 'dt-attended' : 'dt-absent';

    const char = findCharacter(s.character_name);
    const matchIcon = char ? '<span class="dt-match-icon">\u2713</span>' : '<span class="dt-unmatch-icon">\u26A0</span>';
    const clan = char ? esc(char.clan || '') : '';
    const isExpanded = expandedId === s._id;
    const rollResult = s.feeding_roll;
    const rollBadge = rollResult
      ? `<span class="dt-roll-badge rolled">${rollResult.successes} succ</span>`
      : '<span class="dt-roll-badge unrolled">No roll</span>';

    let h = `<div class="dt-sub-card${char ? '' : ' dt-sub-unmatched'}${isExpanded ? ' dt-sub-expanded' : ''}" data-id="${s._id}">
      <div class="dt-sub-top dt-sub-clickable">
        ${matchIcon}
        <span class="dt-sub-name">${esc(s.character_name || '?')}</span>
        <span class="dt-sub-player">${esc(s.player_name || '')}</span>
        <span class="${attendedClass}">${attended}</span>
        ${rollBadge}
      </div>
      <div class="dt-sub-stats">
        ${clan ? `<span class="dt-sub-tag">${clan}</span>` : ''}
        ${projects ? `<span class="dt-sub-tag">${projects} project${projects > 1 ? 's' : ''}</span>` : ''}
        ${spheres ? `<span class="dt-sub-tag">${spheres} sphere</span>` : ''}
        ${feedMethod ? `<span class="dt-sub-tag">${esc(feedMethod)}</span>` : ''}
      </div>`;

    if (isExpanded) {
      h += renderFeedingDetail(s, raw, char);
      h += renderStNotes(s, raw);
    }

    h += '</div>';
    return h;
  }).join('') + '</div>';

  // Card click delegation
  el.querySelectorAll('.dt-sub-clickable').forEach(row => {
    row.addEventListener('click', () => {
      const card = row.closest('.dt-sub-card');
      const id = card.dataset.id;
      expandedId = expandedId === id ? null : id;
      renderSubmissions();
    });
  });

  // Method button delegation
  el.querySelectorAll('.dt-method-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const sub = submissions.find(s => s._id === btn.dataset.subId);
      if (sub) { sub._feed_method = btn.dataset.method; renderSubmissions(); }
    });
  });

  // Notes save delegation
  el.querySelectorAll('.dt-notes-save').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); handleSaveNotes(btn.dataset.subId); });
  });

  // Roll button delegation
  el.querySelectorAll('.dt-feed-roll-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.subId;
      const sub = submissions.find(s => s._id === id);
      const char = sub ? findCharacter(sub.character_name) : null;

      let poolSize;
      if (char && sub._feed_method) {
        const pool = buildFeedingPool(char, sub._feed_method, 0);
        poolSize = pool ? pool.total : 1;
      } else {
        const input = btn.closest('.dt-feed-detail')?.querySelector('.dt-pool-input');
        poolSize = input ? parseInt(input.value) || 1 : 1;
      }
      handleFeedingRoll(id, poolSize);
    });
  });
}

function renderFeedingDetail(s, raw, char) {
  const feed = raw.feeding || {};
  const territories = feed.territories || {};
  const rollResult = s.feeding_roll;

  let h = '<div class="dt-feed-detail">';
  h += '<div class="dt-feed-header">Feeding</div>';

  if (feed.method) h += `<div class="dt-feed-row"><span class="dt-feed-lbl">Submitted</span> ${esc(feed.method)}</div>`;

  // Territory feeding status
  const activeTerrs = Object.entries(territories).filter(([, v]) => v && v !== 'Not feeding here');
  if (activeTerrs.length) {
    h += '<div class="dt-feed-row"><span class="dt-feed-lbl">Territories</span>';
    h += activeTerrs.map(([t, status]) => `<span class="dt-sub-tag">${esc(t)}: ${esc(status)}</span>`).join(' ');
    h += '</div>';
  }

  // Method selection + pool building (only if character matched)
  if (char) {
    h += '<div class="dt-feed-row"><span class="dt-feed-lbl">Hunt method</span>';
    h += '<div class="dt-method-btns">';
    const selectedMethod = s._feed_method || '';
    FEED_METHODS.forEach(m => {
      h += `<button class="dt-method-btn${selectedMethod === m.id ? ' selected' : ''}" data-method="${m.id}" data-sub-id="${s._id}">${esc(m.name)}</button>`;
    });
    h += '</div></div>';

    // Show pool breakdown if method selected
    if (selectedMethod) {
      const pool = buildFeedingPool(char, selectedMethod, 0);
      if (pool) {
        const bd = pool.breakdown;
        h += '<div class="dt-feed-row"><span class="dt-feed-lbl">Pool</span>';
        h += `<span class="dt-pool-breakdown">${bd.attrVal} ${esc(bd.attr)} + ${bd.skillVal} ${esc(bd.skill)}`;
        if (bd.fg) h += ` + ${bd.fg} FG`;
        h += ` = <b>${pool.total}</b></span></div>`;
      }
    }
  } else {
    // Manual pool for unmatched characters
    h += '<div class="dt-feed-row"><span class="dt-feed-lbl">Pool</span>';
    h += `<input type="number" class="dt-pool-input" min="1" max="30" value="${rollResult?.params?.size || 5}">`;
    h += '</div>';
  }

  // Roll button + result
  h += '<div class="dt-feed-roll-row">';
  h += `<button class="dt-btn dt-feed-roll-btn" data-sub-id="${s._id}">${rollResult ? 'Re-roll' : 'Roll'}</button>`;

  if (rollResult) {
    const rc = rollResult.exceptional ? 'exceptional' : rollResult.successes === 0 ? 'failure' : 'normal';
    const vessels = rollResult.successes;
    h += `<span class="dt-feed-result ${rc}">${rollResult.successes} ${rollResult.exceptional ? 'Exceptional' : rollResult.successes === 1 ? 'success' : 'successes'}</span>`;
    if (vessels > 0) h += `<span class="dt-feed-vessels">${vessels} vessel${vessels > 1 ? 's' : ''} \u00B7 ${vessels * 2} Vitae safe</span>`;
    h += `<span class="dt-feed-dice">${esc(rollResult.dice_string || '')}</span>`;
  }

  h += '</div></div>';
  return h;
}

// ── Feeding rolls ───────────────────────────────────────────────────────────

async function handleFeedingRoll(subId, poolSize) {
  const result = rollPool(poolSize);
  const sub = submissions.find(s => s._id === subId);
  if (!sub) return;

  try {
    await updateSubmission(subId, { feeding_roll: result });
    sub.feeding_roll = result;
    renderMatchSummary();
    renderSubmissions();
  } catch (err) {
    console.error('Failed to save feeding roll:', err.message);
  }
}

// ── ST Notes ────────────────────────────────────────────────────────────────

function renderStNotes(s, raw) {
  const csvNotes = raw.meta?.st_notes || '';
  const savedNotes = s.st_notes || '';
  const currentNotes = savedNotes || csvNotes;
  const xpSpend = raw.meta?.xp_spend || '';

  let h = '<div class="dt-notes-detail">';
  h += '<div class="dt-feed-header">ST Notes</div>';

  if (csvNotes && !savedNotes) {
    h += `<div class="dt-notes-csv"><span class="dt-feed-lbl">From CSV</span> ${esc(csvNotes)}</div>`;
  }

  h += `<textarea class="dt-notes-input" data-sub-id="${s._id}" placeholder="ST notes (hidden from players)">${esc(currentNotes)}</textarea>`;
  h += `<div class="dt-notes-actions">
    <button class="dt-btn dt-notes-save" data-sub-id="${s._id}">Save Notes</button>
    <span class="dt-notes-vis">Visibility: ST only</span>
  </div>`;

  if (xpSpend) {
    h += `<div class="dt-notes-xp"><span class="dt-feed-lbl">XP Spend</span> ${esc(xpSpend)}</div>`;
  }

  h += '</div>';
  return h;
}

async function handleSaveNotes(subId) {
  const textarea = document.querySelector(`.dt-notes-input[data-sub-id="${subId}"]`);
  if (!textarea) return;

  const notes = textarea.value.trim();
  const sub = submissions.find(s => s._id === subId);
  if (!sub) return;

  try {
    await updateSubmission(subId, {
      st_notes: notes,
      st_notes_visibility: 'st_only',
      st_notes_updated: new Date().toISOString(),
    });
    sub.st_notes = notes;

    const btn = document.querySelector(`.dt-notes-save[data-sub-id="${subId}"]`);
    if (btn) { btn.textContent = 'Saved \u2713'; setTimeout(() => { btn.textContent = 'Save Notes'; }, 1500); }
  } catch (err) {
    console.error('Failed to save notes:', err.message);
  }
}

// ── File handling ───────────────────────────────────────────────────────────

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) processFile(file);
}

function handleDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.name.endsWith('.csv')) processFile(file);
}

async function processFile(file) {
  const warnEl = document.getElementById('dt-warnings');
  warnEl.innerHTML = '';

  const text = await file.text();
  const { submissions: parsed, warnings } = parseDowntimeCSV(text);

  if (warnings.length) {
    warnEl.innerHTML = warnings.map(w => `<div class="dt-warn">${esc(w)}</div>`).join('');
  }

  if (!parsed.length) {
    warnEl.innerHTML += '<div class="dt-warn">No submissions found in CSV.</div>';
    return;
  }

  const result = await upsertCycle(parsed, file.name.replace('.csv', ''));
  warnEl.innerHTML = `<div class="dt-success">Loaded ${result.created} new, ${result.updated} updated submissions.</div>`;

  await loadActiveCycle();
}

async function handleNewCycle() {
  const label = prompt('Cycle label (e.g. "March 2026"):');
  if (!label) return;
  await createCycle(label);
  await loadActiveCycle();
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
