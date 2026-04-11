/**
 * Print character sheet — placeholder.
 * Opens a print-friendly window with key character stats.
 * Will be replaced with a full designed sheet layout later.
 */

import state from '../data/state.js';
import { esc } from '../data/helpers.js';
import { getAttrEffective as getAttrVal, getAttrBonus, getSkillObj } from '../data/accessors.js';
import { calcHealth, calcWillpowerMax, calcSize, calcSpeed, calcDefence } from '../data/derived.js';
import { xpEarned, xpLeft } from './xp.js';

const ATTR_NAMES = ['Intelligence','Wits','Resolve','Strength','Dexterity','Stamina','Presence','Manipulation','Composure'];
const SKILL_NAMES = [
  'Academics','Computer','Crafts','Investigation','Medicine','Occult','Politics','Science',
  'Athletics','Brawl','Drive','Firearms','Larceny','Stealth','Survival','Weaponry',
  'Animal Ken','Empathy','Expression','Intimidation','Persuasion','Socialise','Streetwise','Subterfuge'
];

function dots(n) { return '\u25CF'.repeat(n); }

export function printSheet() {
  const c = state.chars[state.editIdx];
  if (!c) return;

  const bp = c.blood_potency || 1;
  const hum = c.humanity != null ? c.humanity : '?';
  const hp = calcHealth(c);
  const wp = calcWillpowerMax(c);
  const spd = calcSpeed(c);
  const def = calcDefence(c);
  const sz = calcSize(c);

  const attrsHtml = ATTR_NAMES.map(a => {
    const d = getAttrVal(c, a) + getAttrBonus(c, a);
    return `<tr><td>${esc(a)}</td><td>${dots(d)} (${d})</td></tr>`;
  }).join('');

  const skillsHtml = SKILL_NAMES.map(s => {
    const sk = getSkillObj(c, s);
    const d = sk.dots + (sk.bonus || 0);
    if (!d && !sk.specs.length) return '';
    const specs = sk.specs.length ? ` (${sk.specs.join(', ')})` : '';
    const na = sk.nine_again ? ' [9-again]' : '';
    return `<tr><td>${esc(s)}${esc(specs)}</td><td>${dots(d)} (${d})${na}</td></tr>`;
  }).filter(Boolean).join('');

  const meritsHtml = (c.merits || []).map(m => {
    const qual = m.qualifier ? ` (${m.qualifier})` : '';
    const area = m.area ? ` (${m.area})` : '';
    const tag = m.granted_by ? ` [${m.granted_by}]` : '';
    return `<tr><td>${esc(m.name)}${esc(qual)}${esc(area)}${esc(tag)}</td><td>${dots(m.rating || 0)} (${m.rating || 0})</td></tr>`;
  }).join('');

  const discsHtml = Object.entries(c.disciplines || {}).filter(([, d]) => (d?.dots || 0) > 0).map(([name, d]) => {
    return `<tr><td>${esc(name)}</td><td>${dots(d.dots || 0)} (${d.dots || 0})</td></tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html><head><title>${esc(c.name)} - Character Sheet</title>
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
  .placeholder { text-align: center; color: #888; font-style: italic; margin: 32px 0; border: 1px dashed #ccc; padding: 24px; }
  @media print { body { margin: 0; } }
</style></head><body>
<h1>${esc(c.name)}</h1>
<div class="subtitle">${esc(c.clan || '')}${c.bloodline ? ' / ' + esc(c.bloodline) : ''} &mdash; ${esc(c.covenant || '')}${c.court_title ? ' &mdash; ' + esc(c.court_title) : ''}</div>

<div class="stats">
  <span><span class="stat">Blood Potency:</span> ${bp}</span>
  <span><span class="stat">Humanity:</span> ${hum}</span>
  <span><span class="stat">Health:</span> ${hp}</span>
  <span><span class="stat">Willpower:</span> ${wp}</span>
  <span><span class="stat">Defence:</span> ${def}</span>
  <span><span class="stat">Speed:</span> ${spd}</span>
  <span><span class="stat">Size:</span> ${sz}</span>
  <span><span class="stat">XP:</span> ${xpLeft(c)}/${xpEarned(c)}</span>
</div>

<h2>Attributes</h2>
<table>${attrsHtml}</table>

<h2>Skills</h2>
<table>${skillsHtml}</table>

${meritsHtml ? '<h2>Merits</h2><table>' + meritsHtml + '</table>' : ''}
${discsHtml ? '<h2>Disciplines</h2><table>' + discsHtml + '</table>' : ''}

<div class="placeholder">Full print layout coming soon. This is a placeholder sheet.</div>

</body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}
