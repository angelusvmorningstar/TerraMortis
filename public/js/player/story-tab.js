/* Story tab — lists all published downtime narrative write-ups for the current character,
 * in reverse-chronological order (most recent cycle first). */

import { apiGet } from '../data/api.js';
import { esc } from '../data/helpers.js';

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
    h += `<div class="story-narrative">${esc(sub.published_outcome)}</div>`;
    h += `</div>`;
  }
  h += '</div>';
  el.innerHTML = h;
}
