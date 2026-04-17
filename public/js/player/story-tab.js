/* Story tab — two-pane layout.
 * Left: Chronicle — published downtime narratives, reverse-chronological.
 * Right: Documents — Dossier (character profile from questionnaire) + future static docs.
 */

import { apiGet } from '../data/api.js';
import { esc, parseOutcomeSections, displayName, clanIcon, covIcon } from '../data/helpers.js';

const ACTION_TYPE_LABELS = {
  ambience_increase: 'Ambience Increase', ambience_decrease: 'Ambience Decrease',
  attack: 'Attack', feed: 'Feed', hide_protect: 'Hide / Protect',
  investigate: 'Investigate', patrol_scout: 'Patrol / Scout',
  support: 'Support', misc: 'Miscellaneous', maintenance: 'Maintenance',
  xp_spend: 'XP Spend', block: 'Block', rumour: 'Rumour',
  grow: 'Grow', acquisition: 'Acquisition',
};

export async function renderStoryTab(el, char) {
  el.innerHTML = '<p class="placeholder-msg">Loading...</p>';

  let subs = [], cycles = [], questResponse = null, historyDoc = null;
  try {
    [subs, cycles] = await Promise.all([
      apiGet('/api/downtime_submissions'),
      apiGet('/api/downtime_cycles'),
    ]);
    // STs receive raw docs; promote st_review → published_outcome so ST portal view matches player view
    subs.forEach(s => {
      if (!s.published_outcome && s.st_review?.outcome_visibility === 'published') {
        s.published_outcome = s.st_review.outcome_text;
      }
    });
  } catch (err) {
    el.innerHTML = `<p class="placeholder-msg">Failed to load: ${esc(err.message)}</p>`;
    return;
  }

  try {
    [questResponse, historyDoc] = await Promise.all([
      apiGet(`/api/questionnaire?character_id=${char._id}`).catch(() => null),
      apiGet(`/api/history?character_id=${char._id}`).catch(() => null),
    ]);
  } catch { /* non-fatal */ }

  // Doc card toggle — use onclick to prevent duplicate listeners on re-render
  el.onclick = e => {
    const toggle = e.target.closest('.doc-card-toggle');
    if (!toggle) return;
    const card = toggle.closest('.doc-card');
    const body = card?.querySelector('.doc-card-body');
    if (!body) return;
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    body.hidden = expanded;
    toggle.querySelector('.doc-card-chevron').textContent = expanded ? '▾' : '▴';
  };

  let h = '<div class="story-split">';

  // ── Left: Chronicle ─────────────────────────────────────────────
  h += '<div class="story-left">';
  h += '<h3 class="story-pane-title">Chronicle</h3>';
  h += renderChronicle(subs, cycles, char);
  h += '</div>';

  // ── Right: Documents ─────────────────────────────────────────────
  h += '<div class="story-right">';
  h += '<h3 class="story-pane-title">Documents</h3>';
  h += renderDossier(char, questResponse);
  h += renderHistoryCard(char, historyDoc?.history_text || null, historyDoc?.source || null);
  h += '</div>';

  h += '</div>';
  el.innerHTML = h;
}

// ── Chronicle ─────────────────────────────────────────────────────

function renderChronicle(subs, cycles, char) {
  const cycleMap = {};
  for (const c of cycles) {
    cycleMap[String(c._id)] = c.label || `Cycle ${String(c._id).slice(-4)}`;
  }

  const charId = String(char._id);
  const published = subs
    .filter(s => String(s.character_id) === charId && s.published_outcome)
    .sort((a, b) => (String(b._id) > String(a._id) ? 1 : -1));

  if (!published.length) {
    return '<p class="placeholder-msg story-placeholder">No published downtime narratives yet.</p>';
  }

  let h = '<div class="story-feed">';
  for (const sub of published) {
    const cycleLabel = cycleMap[String(sub.cycle_id)] || 'Unknown Cycle';
    h += `<div class="story-entry">`;
    h += `<div class="story-cycle-label">${esc(cycleLabel)}</div>`;
    h += renderOutcomeWithCards(sub);
    h += `</div>`;
  }
  h += '</div>';
  return h;
}

/** Normalise a heading/title for fuzzy matching (lowercase, collapse non-alpha). */
function _normTitle(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Render the published narrative with project cards injected immediately
 * after their matching section heading. Unmatched cards and merit action
 * cards are appended at the bottom.
 */
function renderOutcomeWithCards(sub) {
  const sections = parseOutcomeSections(sub.published_outcome);

  // Build project card lookup: normalisedTitle → { html, used }
  const cardLookup = {};
  const responses  = sub.st_narrative?.project_responses || [];
  const resolved   = sub.projects_resolved || [];
  const unmatched  = [];

  for (let i = 0; i < 4; i++) {
    const n     = i + 1;
    const title = sub.responses?.[`project_${n}_title`] || sub[`project_${n}_title`];
    if (!title) continue;

    const resp     = responses[i]?.response || '';
    const rev      = resolved[i] || {};
    const actType  = rev.action_type || sub.responses?.[`project_${n}_action`] || sub[`project_${n}_action`] || '';
    const typeLabel = ACTION_TYPE_LABELS[actType] || actType;

    let cardHtml;
    if (!resp) {
      cardHtml  = '<div class="proj-card proj-card-withheld">';
      cardHtml += `<div class="proj-card-name">${esc(title)}</div>`;
      cardHtml += '<p class="proj-card-withheld-msg">Project withheld — see your Storytellers.</p>';
      cardHtml += '</div>';
    } else {
      cardHtml  = '<div class="proj-card">';
      cardHtml += '<div class="proj-card-header">';
      if (typeLabel) cardHtml += `<span class="proj-card-type-chip">${esc(typeLabel)}</span>`;
      cardHtml += `<span class="proj-card-name">${esc(title)}</span>`;
      cardHtml += '</div>';

      const objective = sub.responses?.[`project_${n}_description`] || sub[`project_${n}_description`];
      if (objective) cardHtml += `<div class="proj-card-objective">${esc(objective)}</div>`;

      const poolExpr = rev.pool?.expression || rev.pool_validated || (rev.pool?.total ? String(rev.pool.total) : '');
      if (!rev.no_roll && poolExpr) {
        cardHtml += `<div class="proj-card-pool"><span class="proj-card-pool-label">Pool</span> <span class="proj-card-pool-val">${esc(poolExpr)}</span></div>`;
      }

      if (rev.roll) {
        const suc = rev.roll.successes ?? 0;
        const exc = rev.roll.exceptional;
        const label = exc ? 'Exceptional Success' : suc === 0 ? 'Failure' : `${suc} Success${suc !== 1 ? 'es' : ''}`;
        const cls   = exc ? ' proj-card-roll-exc' : suc === 0 ? ' proj-card-roll-fail' : '';
        cardHtml += `<div class="proj-card-roll${cls}">${esc(label)}</div>`;
        if (rev.roll.dice_string) cardHtml += `<div class="proj-card-dice">${esc(rev.roll.dice_string)}</div>`;
      }

      const note = rev.player_facing_note || rev.player_feedback || '';
      if (note) cardHtml += `<div class="proj-card-feedback"><span class="proj-card-feedback-label">ST Note</span>${esc(note)}</div>`;

      cardHtml += '</div>';
    }

    cardLookup[_normTitle(title)] = { html: cardHtml, used: false };
    unmatched.push(_normTitle(title));
  }

  // Render sections, injecting matched cards inline
  let h = '<div class="story-narrative">';
  for (const sec of sections) {
    if (sec.heading) {
      const isMech = sec.heading === 'Mechanical Outcomes';
      h += `<div class="story-section${isMech ? ' story-section-mech' : ''}">`;
      h += `<h4 class="story-section-head">${esc(sec.heading)}</h4>`;
      const body = sec.lines.join('\n').trim();
      if (isMech) {
        h += `<pre class="story-pre">${esc(body)}</pre>`;
      } else {
        const paras = body.split(/\n{2,}/).filter(Boolean);
        h += paras.map(p => `<p>${esc(p.replace(/\n/g, ' '))}</p>`).join('');
      }
      h += '</div>';

      // Inject matching project card immediately after this section
      const norm = _normTitle(sec.heading);
      if (cardLookup[norm] && !cardLookup[norm].used) {
        cardLookup[norm].used = true;
        h += cardLookup[norm].html;
      }
    } else {
      const body = sec.lines.join('\n').trim();
      const paras = body.split(/\n{2,}/).filter(Boolean);
      h += paras.map(p => `<p>${esc(p.replace(/\n/g, ' '))}</p>`).join('');
    }
  }
  h += '</div>';

  // Unmatched project cards at the bottom
  for (const key of unmatched) {
    if (cardLookup[key] && !cardLookup[key].used) {
      h += cardLookup[key].html;
    }
  }

  // Merit action cards always at the bottom
  h += renderMeritActionCards(sub);

  return h;
}

// ── Merit action cards ────────────────────────────────────────────

/**
 * Reconstructs the ordered list of merit actions from the submission's
 * form responses. Ordering matches downtime-views.js flat index:
 * spheres → contacts → retainers → resources.
 */
function buildPlayerMeritActions(sub) {
  const resp = sub.responses || {};
  const raw  = sub._raw    || {};
  const actions = [];

  // Spheres (Allies, Status, etc.)
  const sphereRaw = raw.sphere_actions || [];
  if (sphereRaw.length) {
    sphereRaw.forEach((entry, idx) => {
      const slot = idx + 1;
      actions.push({
        merit_type:  resp[`sphere_${slot}_merit`] || '',
        action_type: entry.action_type || '',
      });
    });
  } else {
    for (let n = 1; n <= 5; n++) {
      const mt = resp[`sphere_${n}_merit`];
      if (!mt) continue;
      actions.push({ merit_type: mt, action_type: resp[`sphere_${n}_action`] || '' });
    }
  }

  // Contacts
  const contactRaw = raw.contact_actions?.requests || [];
  if (contactRaw.length) {
    contactRaw.forEach(() => actions.push({ merit_type: resp[`contact_1_merit`] || 'Contacts', action_type: 'misc' }));
  } else {
    for (let n = 1; n <= 5; n++) {
      if (!resp[`contact_${n}_request`]) continue;
      actions.push({ merit_type: resp[`contact_${n}_merit`] || 'Contacts', action_type: 'misc' });
    }
  }

  // Retainers
  const retainerRaw = raw.retainer_actions?.actions || [];
  if (retainerRaw.length) {
    retainerRaw.forEach(() => actions.push({ merit_type: 'Retainer', action_type: 'misc' }));
  } else {
    for (let n = 1; n <= 4; n++) {
      if (!resp[`retainer_${n}_task`]) continue;
      actions.push({ merit_type: 'Retainer', action_type: 'misc' });
    }
  }

  // Resources
  const resBlob = raw.acquisitions?.resource_acquisitions || resp['resources_acquisitions'] || '';
  if (resBlob.trim()) {
    actions.push({ merit_type: 'Resources', action_type: 'acquisition' });
  }

  return actions;
}

function renderMeritActionCards(sub) {
  const actions  = buildPlayerMeritActions(sub);
  if (!actions.length) return '';

  const resolved = sub.merit_actions_resolved || [];
  const cards = actions
    .map((a, i) => ({ a, rev: resolved[i] || {} }))
    .filter(({ rev }) => rev.pool || rev.pool_validated || rev.roll);

  if (!cards.length) return '';

  let h = '';
  for (const { a, rev } of cards) {
    // Strip dot characters from stored label: "Allies ●●● (Finance)" → "Allies (Finance)"
    const meritLabel = (a.merit_type || '').replace(/\s*[●○\u25cf\u25cb]+\s*/gi, ' ').replace(/\s+/g, ' ').trim();
    const actionLabel = ACTION_TYPE_LABELS[a.action_type] || a.action_type || '';

    h += '<div class="proj-card">';
    h += '<div class="proj-card-header">';
    if (actionLabel) h += `<span class="proj-card-type-chip">${esc(actionLabel)}</span>`;
    h += `<span class="proj-card-name">${esc(meritLabel)}</span>`;
    h += '</div>';

    const poolExpr = rev.pool?.expression || rev.pool_validated || (rev.pool?.total ? String(rev.pool.total) : '');
    if (poolExpr) h += `<div class="proj-card-pool"><span class="proj-card-pool-label">Pool</span> <span class="proj-card-pool-val">${esc(poolExpr)}</span></div>`;

    if (rev.roll) {
      const suc = rev.roll.successes ?? 0;
      const exc = rev.roll.exceptional;
      const label = exc ? 'Exceptional Success'
        : suc === 0 ? 'Failure'
        : `${suc} Success${suc !== 1 ? 'es' : ''}`;
      const cls = exc ? ' proj-card-roll-exc' : suc === 0 ? ' proj-card-roll-fail' : '';
      h += `<div class="proj-card-roll${cls}">${esc(label)}</div>`;
      if (rev.roll.dice_string) h += `<div class="proj-card-dice">${esc(rev.roll.dice_string)}</div>`;
    }

    const note = rev.player_facing_note || rev.player_feedback || '';
    if (note) {
      h += `<div class="proj-card-feedback"><span class="proj-card-feedback-label">ST Note</span>${esc(note)}</div>`;
    }

    h += '</div>';
  }
  return h;
}

// ── Dossier ───────────────────────────────────────────────────────

function renderDossier(char, quest) {
  const r = quest?.responses || {};
  const name = displayName(char);

  // Format embrace date from YYYY-MM-DD
  const embraceRaw = char.date_of_embrace || '';
  const embraceDisp = embraceRaw
    ? new Date(embraceRaw + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  let h = '<div class="doc-card">';

  // ── Card header (always visible, click to expand) ──
  h += '<button class="doc-card-toggle" aria-expanded="false">';
  h += '<div class="doc-card-header-inner">';
  h += `<span class="doc-card-eyebrow">Dossier</span>`;
  h += `<span class="doc-card-title">${esc(name)}</span>`;
  if (char.concept) h += `<span class="doc-card-subtitle">${esc(char.concept)}</span>`;
  h += '</div>';
  h += '<span class="doc-card-chevron">▾</span>';
  h += '</button>';

  // ── Card body (collapsible) ──
  h += '<div class="doc-card-body reading-pane" hidden>';

  // Identity strip
  h += '<div class="dos-identity">';
  if (char.clan) {
    h += `<span class="dos-identity-item">${clanIcon(char.clan, 16)}<span>${esc(char.clan)}</span>`;
    if (char.bloodline) h += ` <span class="dos-bloodline">/ ${esc(char.bloodline)}</span>`;
    h += '</span>';
  }
  if (char.covenant) {
    h += `<span class="dos-identity-item">${covIcon(char.covenant, 16)}<span>${esc(char.covenant)}</span></span>`;
  }
  if (char.mask || char.dirge) {
    h += `<span class="dos-archetypes">`;
    if (char.mask)  h += `<span><em>Mask:</em> ${esc(char.mask)}</span>`;
    if (char.dirge) h += `<span><em>Dirge:</em> ${esc(char.dirge)}</span>`;
    h += '</span>';
  }
  const stats = [];
  if (char.apparent_age) stats.push(`Apparent age ${esc(char.apparent_age)}`);
  if (embraceDisp) stats.push(`Embraced ${esc(embraceDisp)}`);
  if (stats.length) h += `<span class="dos-stats">${stats.join(' · ')}</span>`;
  h += '</div>';

  // Profile section
  h += dosSection('Character Profile', [
    r.covenant_factions   && dosField('Covenant Faction', r.covenant_factions),
    r.conflict_approach   && dosField('Conflict Approach', resolveConflict(r.conflict_approach)),
    r.aspired_role_tag    && dosField('Aspired Role', resolveRole(r.aspired_role_tag)),
    r.aspired_position    && dosField('Ambition', r.aspired_position),
  ]);

  // Motivations section
  h += dosSection('Motivations', [
    r.court_motivation    && dosField('Why Court?', r.court_motivation),
    r.ambitions_sydney    && dosField('Goals in Sydney', r.ambitions_sydney),
    r.why_sydney          && dosField('Why Sydney?', r.why_sydney),
    r.why_covenant        && dosField('Why their Covenant?', r.why_covenant),
    r.covenant_goals      && dosField('Covenant Goals', r.covenant_goals),
    r.clan_goals          && dosField('Clan Goals', r.clan_goals),
  ]);

  // Views section
  h += dosSection('Views', [
    r.view_traditions     && dosField('The Traditions', r.view_traditions),
    r.view_elysium        && dosField('Elysium', r.view_elysium),
    r.view_mortals        && dosField('Mortals and Ghouls', r.view_mortals),
    r.intolerable_behaviours && dosField('Will Not Tolerate', r.intolerable_behaviours),
  ]);

  // History section
  h += dosSection('History', [
    r.embrace_story       && dosField('The Embrace', r.embrace_story),
    (r.sire_name || r.sire_story) && dosField('Sire', [r.sire_name, r.sire_story].filter(Boolean).join(' — ')),
    r.early_city          && dosField('City of Embrace', r.early_city),
    r.early_nights        && dosField('First Nights', r.early_nights),
    r.last_city_politics  && dosField('Previous City', r.last_city_politics),
    r.touchstones         && dosField('Touchstones', r.touchstones),
    r.common_indulgences  && dosField('Indulgences', r.common_indulgences),
  ]);

  // Mortal family
  if (r.mortal_family) {
    if (Array.isArray(r.mortal_family) && r.mortal_family.length) {
      let fh = '<div class="dos-field"><div class="dos-field-label">Mortal Family</div>';
      for (const m of r.mortal_family) {
        fh += `<div class="dos-family-entry">`;
        if (m.name || m.relationship) {
          fh += `<span class="dos-family-name">${esc([m.name, m.relationship].filter(Boolean).join(', '))}</span>`;
        }
        if (m.description) fh += `<span class="dos-family-desc">${esc(m.description)}</span>`;
        fh += '</div>';
      }
      fh += '</div>';
      h += `<details class="dos-section"><summary class="dos-section-title">Mortal Family</summary><div class="dos-section-body">${fh}</div></details>`;
    } else if (typeof r.mortal_family === 'string' && r.mortal_family) {
      h += dosSection('Mortal Family', [dosField('', r.mortal_family)]);
    }
  }

  // Hunting
  h += dosSection('Hunting', [
    r.hunting_method_tags?.length && dosField('Methods', Array.isArray(r.hunting_method_tags) ? r.hunting_method_tags.join(', ') : r.hunting_method_tags),
    r.hunting_style_note  && dosField('Style', r.hunting_style_note),
    r.first_kill          && dosField('First Kill', r.first_kill),
  ]);

  // Connections
  h += dosSection('Connections', [
    r.allies              && dosField('Allies', r.allies),
    r.coterie             && dosField('Coterie', r.coterie),
    r.enemies             && dosField('Rivals', r.enemies),
    r.opposed_covenant    && dosField('Opposed Covenant', r.opposed_covenant),
  ]);

  h += '</div>'; // doc-card-body
  h += '</div>'; // doc-card
  return h;
}

// ── History card ─────────────────────────────────────────────────

function renderHistoryCard(char, historyText, source) {
  let h = '<div class="doc-card">';
  h += '<button class="doc-card-toggle" aria-expanded="false">';
  h += '<div class="doc-card-header-inner">';
  h += '<span class="doc-card-eyebrow">Character History</span>';
  h += `<span class="doc-card-title">${esc(displayName(char))}</span>`;
  h += '</div>';
  h += '<span class="doc-card-chevron">▾</span>';
  h += '</button>';

  h += '<div class="doc-card-body reading-pane" hidden>';

  if (!historyText) {
    h += '<p class="placeholder-msg">No history submitted yet.</p>';
  } else {
    // Word doc imports are stored as HTML; portal submissions are plain text
    const isHtml = source === 'word_doc' || /<[a-z][\s\S]*>/i.test(historyText);
    if (isHtml) {
      h += `<div class="doc-history-body">${historyText}</div>`;
    } else {
      const paras = historyText.split(/\n{2,}/).filter(Boolean);
      h += '<div class="doc-history-body">';
      h += paras.map(p => `<p>${esc(p.replace(/\n/g, ' '))}</p>`).join('');
      h += '</div>';
    }
  }

  h += '</div>';
  h += '</div>';
  return h;
}

// ── Dossier helpers ───────────────────────────────────────────────

function dosSection(title, fields) {
  const content = fields.filter(Boolean).join('');
  if (!content) return '';
  return `<details class="dos-section"><summary class="dos-section-title">${esc(title)}</summary><div class="dos-section-body">${content}</div></details>`;
}

function dosField(label, value) {
  if (!value) return '';
  return `<div class="dos-field">${label ? `<div class="dos-field-label">${esc(label)}</div>` : ''}<div class="dos-field-value">${esc(String(value))}</div></div>`;
}

function resolveConflict(v) {
  return { Monstrous: 'Intimidation', Seductive: 'Manipulation', Competitive: 'Superiority' }[v] || v;
}

function resolveRole(v) {
  return {
    ruler: 'Ruler', primogen: 'Primogen', administrator: 'Administrator',
    regent: 'Regent', socialite: 'Socialite', enforcer: 'Enforcer', none_yet: 'None yet',
  }[v] || v;
}
