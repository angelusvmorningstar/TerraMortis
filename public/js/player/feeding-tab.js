/**
 * Feeding tab — standalone hunt method selection and description.
 * Available after downtime is resolved (when game cycle activates).
 * Separate from the downtime form — does not include territory grid or influence.
 */

import { esc, displayName } from '../data/helpers.js';
import { FEED_METHODS } from './downtime-data.js';
import { ALL_ATTRS, ALL_SKILLS } from '../data/constants.js';

let currentChar = null;
let feedMethodId = '';
let feedDiscName = '';
let feedSpecName = '';
let feedCustomAttr = '';
let feedCustomSkill = '';
let feedCustomDisc = '';
let feedDescription = '';

export function renderFeedingTab(container, char) {
  currentChar = char;
  if (!container || !char) {
    if (container) container.innerHTML = '<p class="placeholder-msg">Select a character to view feeding options.</p>';
    return;
  }
  render(container);
}

function render(container) {
  const c = currentChar;
  let h = '<div class="feeding-wrap">';
  h += '<h3 class="feeding-title">Feeding: The Hunt</h3>';
  h += '<p class="feeding-desc">Select your character\'s preferred hunting method. This determines the dice pool for feeding rolls.</p>';

  // Method cards
  h += '<div class="dt-feed-methods">';
  for (const m of FEED_METHODS) {
    const sel = feedMethodId === m.id ? ' dt-feed-sel' : '';
    h += `<button type="button" class="dt-feed-card${sel}" data-feed-method="${m.id}">`;
    h += `<div class="dt-feed-card-name">${esc(m.name)}</div>`;
    h += `<div class="dt-feed-card-desc">${esc(m.desc)}</div>`;
    h += '</button>';
  }
  h += '</div>';

  // Pool breakdown for selected method
  if (feedMethodId && feedMethodId !== 'other') {
    const m = FEED_METHODS.find(fm => fm.id === feedMethodId);
    if (m) {
      let bestA = '', bestAV = 0;
      for (const a of m.attrs) {
        const av = c.attributes?.[a]; const v = av ? (av.dots || 0) + (av.bonus || 0) : 0;
        if (v > bestAV) { bestAV = v; bestA = a; }
      }
      let bestS = '', bestSV = 0, bestSpecs = [];
      for (const s of m.skills) {
        const sv = c.skills?.[s]; const v = sv ? (sv.dots || 0) + (sv.bonus || 0) : 0;
        if (v > bestSV) { bestSV = v; bestS = s; bestSpecs = sv?.specs || []; }
      }

      const hasAoE = (c.merits || []).some(m => m.name?.toLowerCase() === 'area of expertise');
      const specBonus = feedSpecName ? (hasAoE ? 2 : 1) : 0;
      const availDiscs = m.discs.filter(d => c.disciplines?.[d]);
      const discVal = (feedDiscName && c.disciplines?.[feedDiscName]) || 0;
      const total = bestAV + bestSV + discVal + specBonus;

      h += '<div class="dt-feed-pool">';
      h += '<div class="dt-feed-breakdown">';
      h += `<span class="dt-feed-bv">${bestAV}</span> ${esc(bestA)}`;
      h += ` + <span class="dt-feed-bv">${bestSV}</span> ${esc(bestS)}`;
      if (bestSpecs.length) h += ` <span class="dt-feed-dim">[${esc(bestSpecs.join(', '))}]</span>`;
      if (discVal) h += ` + <span class="dt-feed-bv">${discVal}</span> ${esc(feedDiscName)}`;
      if (specBonus) h += ` + <span class="dt-feed-bv">${specBonus}</span> ${esc(feedSpecName)}`;
      h += ` = <span class="dt-feed-total">${total} dice</span>`;
      h += '</div>';

      if (bestSpecs.length) {
        h += '<div class="dt-feed-spec-row">';
        h += '<label class="dt-feed-disc-lbl">Specialisation:</label>';
        for (const sp of bestSpecs) {
          const on = feedSpecName === sp ? ' dt-feed-spec-on' : '';
          h += `<button type="button" class="dt-feed-spec-chip${on}" data-feed-spec="${esc(sp)}">${esc(sp)} <span class="dt-feed-spec-bonus">+${hasAoE ? 2 : 1}</span></button>`;
        }
        h += '</div>';
      }

      if (availDiscs.length) {
        h += '<div class="dt-feed-disc-row">';
        h += '<label class="dt-feed-disc-lbl">Discipline:</label>';
        h += '<select class="qf-select dt-feed-disc-sel" id="feed-tab-disc">';
        h += '<option value="">None</option>';
        for (const d of availDiscs) {
          const dv = c.disciplines[d];
          const sel = feedDiscName === d ? ' selected' : '';
          h += `<option value="${esc(d)}"${sel}>${esc(d)} (${dv})</option>`;
        }
        h += '</select></div>';
      }
      h += '</div>';
    }
  }

  // Custom method builder
  if (feedMethodId === 'other') {
    const attrs = ALL_ATTRS.filter(a => { const v = c.attributes?.[a]; return v && (v.dots + (v.bonus || 0)) > 0; });
    const skills = ALL_SKILLS.filter(s => { const v = c.skills?.[s]; return v && (v.dots + (v.bonus || 0)) > 0; });
    const discs = Object.entries(c.disciplines || {}).filter(([, v]) => v > 0);

    let customTotal = 0;
    if (feedCustomAttr) { const a = c.attributes?.[feedCustomAttr]; if (a) customTotal += (a.dots || 0) + (a.bonus || 0); }
    if (feedCustomSkill) { const s = c.skills?.[feedCustomSkill]; if (s) customTotal += (s.dots || 0) + (s.bonus || 0); }
    if (feedCustomDisc) customTotal += c.disciplines?.[feedCustomDisc] || 0;

    h += '<div class="dt-feed-custom">';
    h += '<p class="qf-desc">Custom feeding method — subject to ST approval.</p>';
    h += '<div class="dt-feed-custom-row">';
    h += '<select class="qf-select" id="feed-tab-custom-attr"><option value="">Attribute</option>';
    for (const a of attrs) { const v = c.attributes[a]; const dots = (v.dots || 0) + (v.bonus || 0); h += `<option value="${esc(a)}"${feedCustomAttr === a ? ' selected' : ''}>${esc(a)} (${dots})</option>`; }
    h += '</select>';
    h += '<select class="qf-select" id="feed-tab-custom-skill"><option value="">Skill</option>';
    for (const s of skills) { const v = c.skills[s]; const dots = (v.dots || 0) + (v.bonus || 0); h += `<option value="${esc(s)}"${feedCustomSkill === s ? ' selected' : ''}>${esc(s)} (${dots})</option>`; }
    h += '</select>';
    h += '<select class="qf-select" id="feed-tab-custom-disc"><option value="">Discipline</option>';
    for (const [d, v] of discs) { h += `<option value="${esc(d)}"${feedCustomDisc === d ? ' selected' : ''}>${esc(d)} (${v})</option>`; }
    h += '</select>';
    if (customTotal) h += `<span class="dt-feed-total">= ${customTotal} dice</span>`;
    h += '</div></div>';
  }

  // Description textarea
  if (feedMethodId) {
    h += '<div class="qf-field" style="margin-top:12px;">';
    h += '<label class="qf-label">Describe how your character hunts</label>';
    h += `<textarea id="feed-tab-desc" class="qf-textarea" rows="4">${esc(feedDescription)}</textarea>`;
    h += '</div>';
  }

  h += '</div>';
  container.innerHTML = h;
  wireEvents(container);
}

function wireEvents(container) {
  // Method selection
  container.querySelectorAll('[data-feed-method]').forEach(btn => {
    btn.addEventListener('click', () => {
      feedMethodId = btn.dataset.feedMethod;
      feedDiscName = '';
      feedSpecName = '';
      feedCustomAttr = ''; feedCustomSkill = ''; feedCustomDisc = '';
      render(container);
    });
  });

  // Spec chips
  container.querySelectorAll('[data-feed-spec]').forEach(btn => {
    btn.addEventListener('click', () => {
      feedSpecName = feedSpecName === btn.dataset.feedSpec ? '' : btn.dataset.feedSpec;
      render(container);
    });
  });

  // Discipline dropdown
  container.querySelector('#feed-tab-disc')?.addEventListener('change', e => {
    feedDiscName = e.target.value;
    render(container);
  });

  // Custom selectors
  container.querySelector('#feed-tab-custom-attr')?.addEventListener('change', e => { feedCustomAttr = e.target.value; render(container); });
  container.querySelector('#feed-tab-custom-skill')?.addEventListener('change', e => { feedCustomSkill = e.target.value; render(container); });
  container.querySelector('#feed-tab-custom-disc')?.addEventListener('change', e => { feedCustomDisc = e.target.value; render(container); });

  // Description
  container.querySelector('#feed-tab-desc')?.addEventListener('input', e => {
    feedDescription = e.target.value;
  });
}

/** Get feeding data for inclusion in downtime submission or separate storage. */
export function getFeedingData() {
  return {
    method: feedMethodId,
    disc: feedDiscName,
    spec: feedSpecName,
    custom_attr: feedCustomAttr,
    custom_skill: feedCustomSkill,
    custom_disc: feedCustomDisc,
    description: feedDescription,
  };
}
