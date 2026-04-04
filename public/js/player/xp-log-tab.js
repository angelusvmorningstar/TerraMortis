/* XP Log tab — earned/spent breakdown for the player portal. */

import { esc } from '../data/helpers.js';
import {
  xpEarned, xpSpent, xpLeft,
  xpStarting, xpHumanityDrop, xpOrdeals, xpGame, xpPT5,
  xpSpentAttrs, xpSpentSkills, xpSpentMerits, xpSpentPowers, xpSpentSpecial,
  setDevotionsDB,
} from '../editor/xp.js';
import { DEVOTIONS_DB } from '../data/devotions-db.js';

setDevotionsDB(DEVOTIONS_DB);

export function renderXpLogTab(el, char) {
  const earned   = xpEarned(char);
  const spent    = xpSpent(char);
  const left     = xpLeft(char);
  const overBudget = left < 0;

  const fromGame     = xpGame(char);
  const fromOrdeals  = xpOrdeals(char);
  const fromHumanity = xpHumanityDrop(char);
  const fromPT5      = xpPT5(char);

  const spAttrs    = xpSpentAttrs(char);
  const spSkills   = xpSpentSkills(char);
  const spMerits   = xpSpentMerits(char);
  const spPowers   = xpSpentPowers(char);
  const spSpecial  = xpSpentSpecial(char);

  let h = '<div class="xpl-log">';

  // Balance
  h += `<div class="xpl-panel ${overBudget ? 'xpl-over' : 'xpl-ok'}">`;
  h += '<div class="xpl-balance">';
  h += '<span class="xpl-bal-lbl">XP Available</span>';
  h += `<span class="xpl-bal-val">${left}</span>`;
  h += '</div>';
  if (overBudget) {
    h += `<p class="xpl-over-warn">Over budget by ${Math.abs(left)} XP</p>`;
  }
  h += '</div>';

  h += '<div class="xpl-log-cols">';

  // Earned
  h += '<div class="xpl-panel xpl-log-col">';
  h += '<div class="xpl-col-head">Earned</div>';
  h += '<table class="xpl-table">';
  h += row('Starting', 10);
  if (fromGame)     h += row('Game attendance', fromGame);
  if (fromOrdeals)  h += row(`Ordeals (${Math.round(fromOrdeals / 3)}\xD73)`, fromOrdeals);
  if (fromHumanity) h += row('Humanity loss', fromHumanity);
  if (fromPT5)      h += row('Professional Training \u25CF\u25CF\u25CF\u25CF\u25CF', fromPT5);
  h += totalRow('Total', earned);
  h += '</table>';
  h += '</div>';

  // Spent
  h += '<div class="xpl-panel xpl-log-col">';
  h += '<div class="xpl-col-head">Spent</div>';
  h += '<table class="xpl-table">';
  if (spAttrs)   h += row('Attributes', spAttrs);
  if (spSkills)  h += row('Skills & Specialisations', spSkills);
  if (spPowers)  h += row('Disciplines, Devotions & Rites', spPowers);
  if (spMerits)  h += row('Merits & Fighting Styles', spMerits);
  if (spSpecial) h += row('Blood Potency & Other', spSpecial);
  if (!spent)    h += '<tr><td colspan="2" class="xpl-none">Nothing spent yet.</td></tr>';
  h += totalRow('Total', spent);
  h += '</table>';
  h += '</div>';

  h += '</div>'; // xpl-log-cols
  h += '</div>'; // xpl-log
  el.innerHTML = h;
}

function row(label, value) {
  return `<tr><td>${esc(label)}</td><td class="xpl-n">${value}</td></tr>`;
}

function totalRow(label, value) {
  return `<tr class="xpl-total"><td>${esc(label)}</td><td class="xpl-n">${value}</td></tr>`;
}
