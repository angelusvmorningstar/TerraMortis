/**
 * Print character sheet — uses the resolved serialiser for all data.
 * Also exports the JSON for external PDF tools.
 */

import state from '../data/state.js';
import { esc } from '../data/helpers.js';
import { serialiseForPrint, exportCharacterJSON } from './export-character.js';

function dots(n) { return '\u25CF'.repeat(Math.max(0, n)); }

export function printSheet() {
  const c = state.chars[state.editIdx];
  if (!c) return;

  const d = serialiseForPrint(c);

  const attrsHtml = Object.entries(d.attributes).map(([name, a]) => {
    const bonusTag = a.bonus ? ` <span style="color:#888">(+${a.bonus} bonus)</span>` : '';
    return `<tr><td>${esc(name)}</td><td>${dots(a.effective)} (${a.effective})${bonusTag}</td></tr>`;
  }).join('');

  const skillsHtml = d.skills.map(s => {
    const specs = s.specialisations.length ? ` (${s.specialisations.join(', ')})` : '';
    const tags = [];
    if (s.nine_again) tags.push('9-again');
    if (s.pt_bonus) tags.push('+1 PT');
    if (s.mci_bonus) tags.push('+1 MCI');
    const tagStr = tags.length ? ' [' + tags.join(', ') + ']' : '';
    return `<tr><td>${esc(s.name)}${esc(specs)}</td><td>${dots(s.effective)} (${s.effective})${tagStr}</td></tr>`;
  }).join('');

  const meritsHtml = d.merits.map(m => {
    const qual = m.qualifier ? ` (${m.qualifier})` : '';
    const area = m.area ? ` (${m.area})` : '';
    const tag = m.granted_by ? ` [${m.granted_by}]` : '';
    let suffix = '';
    if (m.is_shared && m.effective_rating > m.own_dots) suffix = ` (${m.own_dots} own + ${m.effective_rating - m.own_dots} shared)`;
    if (m.bonuses.length) suffix += ' ' + m.bonuses.join(' ');
    return `<tr><td>${esc(m.name)}${esc(qual)}${esc(area)}${esc(tag)}</td><td>${dots(m.effective_rating)} (${m.effective_rating})${esc(suffix)}</td></tr>`;
  }).join('');

  const discsHtml = d.disciplines.map(disc => {
    let h = `<tr><td colspan="2" style="font-weight:bold;padding-top:8px">${esc(disc.name)} ${dots(disc.dots)}${disc.in_clan ? ' <span style="color:#888;font-weight:normal">(in-clan)</span>' : ''}</td></tr>`;
    disc.powers.forEach(p => {
      h += `<tr><td style="padding-left:16px">${esc(p.name)}</td><td style="font-size:9pt;color:#555">${esc(p.stats)}</td></tr>`;
    });
    return h;
  }).join('');

  const devotionsHtml = d.devotions.map(dv =>
    `<tr><td>${esc(dv.name)}</td><td>${dv.xp_cost} XP</td></tr>`
  ).join('');

  const ritesHtml = d.rites.map(r =>
    `<tr><td>${esc(r.name)} ${dots(r.level)}</td><td>${esc(r.tradition)} \u2014 ${r.free ? 'Free' : r.xp_cost + ' XP'}</td></tr>`
  ).join('');

  const stylesHtml = d.fighting_styles.map(fs =>
    `<tr><td>${esc(fs.name)}</td><td>${dots(fs.dots)} (${fs.dots})</td></tr>`
  ).join('');

  const banesHtml = d.banes.map(b =>
    `<tr><td>${esc(b.name)}${b.is_curse ? ' <em>(Clan Curse)</em>' : ''}</td><td style="font-size:9pt">${esc(b.effect)}</td></tr>`
  ).join('');

  const touchHtml = d.touchstones.map(t =>
    `<tr><td>Humanity ${t.humanity}: ${esc(t.name)}</td><td style="font-size:9pt;color:#555">${esc(t.desc || '')}</td></tr>`
  ).join('');

  const xb = d.xp.breakdown;

  const html = `<!DOCTYPE html>
<html><head><title>${esc(d.identity.name)} - Character Sheet</title>
<style>
  body { font-family: Georgia, serif; max-width: 700px; margin: 20px auto; color: #222; font-size: 11pt; }
  h1 { font-family: 'Cinzel', serif; margin: 0 0 4px; font-size: 18pt; }
  .subtitle { color: #555; margin-bottom: 16px; }
  h2 { font-family: 'Cinzel', serif; font-size: 12pt; border-bottom: 1px solid #999; margin: 16px 0 6px; padding-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2px 6px; vertical-align: top; }
  td:first-child { width: 55%; }
  td:last-child { text-align: right; font-family: monospace; }
  .stats { display: flex; gap: 24px; flex-wrap: wrap; margin: 8px 0; }
  .stat { font-weight: bold; }
  .xp-row { display: flex; justify-content: space-between; max-width: 400px; }
  .xp-row span:last-child { font-family: monospace; }
  @media print { body { margin: 0; } }
</style></head><body>
<h1>${esc(d.identity.displayName)}</h1>
<div class="subtitle">${esc(d.identity.clan || '')}${d.identity.bloodline ? ' / ' + esc(d.identity.bloodline) : ''} &mdash; ${esc(d.identity.covenant || '')}${d.identity.court_title ? ' &mdash; ' + esc(d.identity.court_title) : ''}${d.identity.regent_territory ? ' &mdash; Regent of ' + esc(d.identity.regent_territory) : ''}</div>

<div class="stats">
  <span><span class="stat">BP:</span> ${d.stats.blood_potency}</span>
  <span><span class="stat">Humanity:</span> ${d.stats.humanity}</span>
  <span><span class="stat">Health:</span> ${d.stats.health}</span>
  <span><span class="stat">Willpower:</span> ${d.stats.willpower}</span>
  <span><span class="stat">Defence:</span> ${d.stats.defence}</span>
  <span><span class="stat">Speed:</span> ${d.stats.speed}</span>
  <span><span class="stat">Size:</span> ${d.stats.size}</span>
  <span><span class="stat">Vitae Max:</span> ${d.stats.vitae_max}</span>
  <span><span class="stat">Influence:</span> ${d.stats.influence_total}</span>
</div>
<div class="stats">
  <span><span class="stat">Status:</span> City ${d.stats.status.city} / Clan ${d.stats.status.clan} / Covenant ${d.stats.status.covenant}</span>
  <span><span class="stat">XP:</span> ${d.xp.remaining} / ${d.xp.earned} (${d.xp.spent} spent)</span>
</div>

<h2>Attributes</h2>
<table>${attrsHtml}</table>

<h2>Skills</h2>
<table>${skillsHtml}</table>

${discsHtml ? '<h2>Disciplines</h2><table>' + discsHtml + '</table>' : ''}
${devotionsHtml ? '<h2>Devotions</h2><table>' + devotionsHtml + '</table>' : ''}
${ritesHtml ? '<h2>Rites</h2><table>' + ritesHtml + '</table>' : ''}
${meritsHtml ? '<h2>Merits</h2><table>' + meritsHtml + '</table>' : ''}
${stylesHtml ? '<h2>Fighting Styles</h2><table>' + stylesHtml + '</table>' : ''}
${touchHtml ? '<h2>Touchstones</h2><table>' + touchHtml + '</table>' : ''}
${banesHtml ? '<h2>Banes</h2><table>' + banesHtml + '</table>' : ''}

<h2>XP Breakdown</h2>
<div class="xp-row"><span>Starting</span><span>${xb.starting}</span></div>
<div class="xp-row"><span>Humanity Drops</span><span>${xb.humanity_drops}</span></div>
<div class="xp-row"><span>Ordeals</span><span>${xb.ordeals}</span></div>
<div class="xp-row"><span>Game Attendance</span><span>${xb.game}</span></div>
<div class="xp-row" style="font-weight:bold;border-top:1px solid #999;margin-top:4px;padding-top:4px"><span>Total Earned</span><span>${d.xp.earned}</span></div>

<h2>Influence Breakdown</h2>
${d.influence_breakdown.map(l => '<div>' + esc(l) + '</div>').join('')}

</body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

/** Generate a PDF via the server API and open in a new tab. */
export async function printPDF() {
  const c = state.chars[state.editIdx];
  if (!c) return;
  const data = serialiseForPrint(c);
  const token = localStorage.getItem('tm_auth_token');
  const apiBase = location.hostname === 'localhost' ? 'http://localhost:3000' : '';
  try {
    const res = await fetch(`${apiBase}/api/pdf/character`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      // Try to read the error details from the server
      let detail = res.status;
      try { const body = await res.json(); detail = body.message + '\n' + (body.stack || ''); } catch {}
      console.error('PDF server error:', detail);
      alert('PDF generation failed on server:\n\n' + detail);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  } catch (err) {
    console.error('PDF generation failed:', err);
    // Fallback to HTML print
    printSheet();
  }
}

/** Export the resolved character data as a downloadable JSON file. */
export function exportJSON() {
  const c = state.chars[state.editIdx];
  if (!c) return;
  exportCharacterJSON(c);
}
