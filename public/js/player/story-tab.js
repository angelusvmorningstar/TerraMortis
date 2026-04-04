/* Story tab — lists all published downtime narrative write-ups for the current character,
 * in reverse-chronological order (most recent cycle first). */

import { apiGet } from '../data/api.js';
import { esc, parseOutcomeSections } from '../data/helpers.js';

export async function renderStoryTab(el, char) {
  el.innerHTML = '<p class="placeholder-msg">Loading...</p>';

  let subs = [];
  let cycles = [];
  try {
    [subs, cycles] = await Promise.all([
      apiGet('/api/downtime_submissions'),
      apiGet('/api/downtime_cycles'),
    ]);
  } catch (err) {
    el.innerHTML = `<p class="placeholder-msg">Failed to load: ${esc(err.message)}</p>`;
    return;
  }

  // Build cycle label map keyed by _id string
  const cycleMap = {};
  for (const c of cycles) {
    cycleMap[String(c._id)] = c.label || `Cycle ${String(c._id).slice(-4)}`;
  }

  // Filter to published submissions for this character
  const charId = String(char._id);
  const published = subs
    .filter(s => String(s.character_id) === charId && s.published_outcome)
    .sort((a, b) => (String(b._id) > String(a._id) ? 1 : -1));

  if (!published.length) {
    el.innerHTML = '<p class="placeholder-msg">No published downtime narratives yet.</p>';
    return;
  }

  let h = '<div class="story-feed">';
  for (const sub of published) {
    const cycleLabel = cycleMap[String(sub.cycle_id)] || 'Unknown Cycle';
    h += `<div class="story-entry">`;
    h += `<div class="story-cycle-label">${esc(cycleLabel)}</div>`;
    h += renderOutcome(sub.published_outcome);
    h += `</div>`;
  }
  h += '</div>';
  el.innerHTML = h;
}

function renderOutcome(text) {
  const sections = parseOutcomeSections(text);
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
    } else {
      const body = sec.lines.join('\n').trim();
      const paras = body.split(/\n{2,}/).filter(Boolean);
      h += paras.map(p => `<p>${esc(p.replace(/\n/g, ' '))}</p>`).join('');
    }
  }
  h += '</div>';
  return h;
}
