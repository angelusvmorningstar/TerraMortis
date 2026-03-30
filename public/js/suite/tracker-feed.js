/**
 * tracker-feed.js — Feeding test system for the Session Tracker tab.
 *
 * Handles hunt method selection, pool building, rolling, and vitae application.
 */


import state from './data.js';
import { rollPool, cntSuc } from '../shared/dice.js';
import {
  stGetTracker, stSetTracker, stMaxVitae,
  stGetActive, toast
} from './tracker.js';
import { getAttrVal, skDots, skSpecStr } from '../data/accessors.js';

// ══════════════════════════════════════════════
//  FEEDING CONSTANTS
// ══════════════════════════════════════════════

const FEED_METHODS = [
  {
    id: 'seduction',
    name: 'Seduction',
    desc: 'Lure a vessel close',
    attrs: ['Presence', 'Manipulation'],
    skills: ['Empathy', 'Socialise', 'Persuasion'],
    discs: ['Majesty', 'Dominate']
  },
  {
    id: 'stalking',
    name: 'Stalking',
    desc: 'Prey on a target unseen',
    attrs: ['Dexterity', 'Wits'],
    skills: ['Stealth', 'Athletics'],
    discs: ['Protean', 'Obfuscate']
  },
  {
    id: 'force',
    name: 'By Force',
    desc: 'Overpower and drain',
    attrs: ['Strength'],
    skills: ['Brawl', 'Weaponry'],
    discs: ['Vigour', 'Nightmare']
  },
  {
    id: 'familiar',
    name: 'Familiar Face',
    desc: 'Exploit an existing acquaintance',
    attrs: ['Manipulation', 'Presence'],
    skills: ['Persuasion', 'Subterfuge'],
    discs: ['Dominate', 'Majesty']
  },
  {
    id: 'intimidation',
    name: 'Intimidation',
    desc: 'Compel through fear',
    attrs: ['Strength', 'Manipulation'],
    skills: ['Intimidation', 'Subterfuge'],
    discs: ['Nightmare', 'Dominate']
  }
];

const FEED_TERRS = [
  { id: '', name: 'No territory', ambienceMod: 0 },
  { id: 'academy', name: 'The Academy', ambience: 'Curated', ambienceMod: +3 },
  { id: 'dockyards', name: 'The Dockyards', ambience: 'Settled', ambienceMod: 0 },
  { id: 'harbour', name: 'The Harbour', ambience: 'Untended', ambienceMod: -2 },
  { id: 'northshore', name: 'The North Shore', ambience: 'Tended', ambienceMod: +2 },
  { id: 'secondcity', name: 'The Second City', ambience: 'Tended', ambienceMod: +2 }
];

let feedMethod = null;

// ══════════════════════════════════════════════
//  FEED UI
// ══════════════════════════════════════════════

function feedToggle() {
  const panel = document.getElementById('feed-panel');
  const chev = document.getElementById('feed-chev');
  const open = panel.style.display === 'none';
  panel.style.display = open ? 'block' : 'none';
  chev.style.transform = open ? 'rotate(180deg)' : '';
  if (open) feedInit();
}

function feedInit() {
  // Populate territory dropdown
  const tsel = document.getElementById('feed-terr');
  if (tsel.options.length <= 1) {
    FEED_TERRS.forEach(t => {
      if (!t.id) return; // already have the blank option
      const o = document.createElement('option');
      o.value = t.id;
      o.textContent = t.name + (t.ambience
        ? ' — ' + t.ambience + (t.ambienceMod > 0 ? ' (+' + t.ambienceMod + ')' : t.ambienceMod < 0 ? ' (' + t.ambienceMod + ')' : '')
        : '');
      tsel.appendChild(o);
    });
  }
  // Render method cards
  const mc = document.getElementById('feed-methods');
  if (!mc.children.length) {
    FEED_METHODS.forEach(m => {
      const card = document.createElement('button');
      card.className = 'feed-method-card';
      card.dataset.id = m.id;
      card.innerHTML = `<div class="feed-method-name">${m.name}</div><div class="feed-method-desc">${m.desc}</div>`;
      card.onclick = () => feedSelectMethod(m.id);
      mc.appendChild(card);
    });
  }
}

function feedSelectMethod(id) {
  feedMethod = FEED_METHODS.find(m => m.id === id);
  document.querySelectorAll('.feed-method-card').forEach(c => {
    c.classList.toggle('selected', c.dataset.id === id);
  });
  feedBuildPool();
}

function feedGetChar() {
  const chars = state.chars;
  const active = stGetActive();
  return active.length ? (chars.find(c => c.name === active[0]) || null) : null;
}

function feedBuildPool() {
  const c = feedGetChar();
  if (!c || !feedMethod) {
    document.getElementById('feed-pool-section').style.display = 'none';
    return;
  }
  const m = feedMethod;

  // Best attribute
  let bestAttrVal = 0, bestAttrName = '';
  m.attrs.forEach(a => {
    const v = getAttrVal(c, a);
    if (v > bestAttrVal) { bestAttrVal = v; bestAttrName = a; }
  });

  // Best skill
  let bestSkillVal = 0, bestSkillName = 'none', bestSkillSpec = null;
  m.skills.forEach(s => {
    const v = skDots(c, s);
    if (v > bestSkillVal) { bestSkillVal = v; bestSkillName = s; bestSkillSpec = skSpecStr(c, s) || null; }
  });

  // Territory ambience
  const terrId = document.getElementById('feed-terr').value;
  const terr = FEED_TERRS.find(t => t.id === terrId) || { ambienceMod: 0 };
  const ambMod = terr.ambienceMod || 0;

  // Discipline select — populate with valid discs char has
  const dsel = document.getElementById('feed-disc');
  const prevDisc = dsel.value;
  while (dsel.options.length > 1) dsel.remove(1);
  m.discs.forEach(d => {
    if (c.disciplines && c.disciplines[d]) {
      const o = document.createElement('option');
      o.value = d;
      o.textContent = d + ' (' + c.disciplines[d] + ')';
      dsel.appendChild(o);
    }
  });
  if (prevDisc) dsel.value = prevDisc;

  const discName = dsel.value;
  const discVal = (discName && c.disciplines) ? (c.disciplines[discName] || 0) : 0;

  const total = Math.max(0, bestAttrVal + bestSkillVal + discVal + ambMod);

  // Breakdown display
  const bd = document.getElementById('feed-breakdown');
  let html = `<span>${bestAttrVal}</span> ${bestAttrName}`;
  html += `<br>+ <span>${bestSkillVal}</span> ${bestSkillName}`;
  if (bestSkillSpec) html += ` <span class="feed-dim">[${bestSkillSpec}]</span>`;
  if (discVal) html += `<br>+ <span>${discVal}</span> ${discName}`;
  if (ambMod !== 0) html += `<br>${ambMod > 0 ? '+ ' : '− '}<span>${Math.abs(ambMod)}</span> Ambience (${terr.ambience})`;
  bd.innerHTML = html;
  document.getElementById('feed-pool-n').textContent = total;
  document.getElementById('feed-pool-section').style.display = 'block';
  document.getElementById('feed-result-section').style.display = 'none';
}

function feedRoll() {
  const poolN = parseInt(document.getElementById('feed-pool-n').textContent) || 0;
  if (poolN <= 0) return;

  const cols = rollPool(poolN);
  const suc = cntSuc(cols);
  const vessels = suc;
  const safeVitae = vessels * 2;

  // Dice display
  const diceHtml = cols.map(col => {
    const all = [col.r, ...col.ch];
    return all.map(d => `<span class="feed-die${d.s ? ' fd-s' : ''}${d.v === 1 ? ' fd-1' : ''}">${d.v}</span>`).join('');
  }).join(' ');

  document.getElementById('feed-result-box').innerHTML = `
    <div class="feed-suc-row">
      <div><div class="feed-suc">${suc}</div><div class="feed-suc-lbl">success${suc !== 1 ? 'es' : ''} — ${poolN} dice</div></div>
    </div>
    <div class="feed-dice-row">${diceHtml}</div>
  `;

  if (vessels === 0) {
    document.getElementById('feed-vessel-row').innerHTML = `
      <div class="feed-v-lbl" style="padding:12px 14px;">No vessels secured this hunt.</div>
    `;
    document.getElementById('feed-push-row').innerHTML = '';
  } else {
    document.getElementById('feed-vessel-row').innerHTML = `
      <div style="padding:12px 14px 8px;">
        <div class="feed-v-num">${vessels}</div>
        <div class="feed-v-lbl">vessel${vessels !== 1 ? 's' : ''} available &nbsp;·&nbsp; <b>${safeVitae} Vitae</b> safe (2 per vessel)</div>
      </div>
    `;
    // Apply controls
    document.getElementById('feed-push-row').innerHTML = `
      <div class="feed-apply-row">
        <div class="feed-apply-lbl">Apply vitae gained:</div>
        <div class="feed-apply-controls">
          <button class="feed-adj" onclick="feedAdjApply(-1)">−</button>
          <span class="feed-adj-val" id="feed-apply-n">${safeVitae}</span>
          <button class="feed-adj" onclick="feedAdjApply(1)">+</button>
          <span class="feed-apply-cap">(max safe: ${safeVitae})</span>
        </div>
        <button class="feed-apply-btn" onclick="feedApplyVitae(${safeVitae})">Apply to Tracker</button>
        <div class="feed-push-note">Draining beyond ${safeVitae} Vitae risks harm — Humanity check if a vessel is drained to incapacitation.</div>
      </div>
    `;
  }

  document.getElementById('feed-result-section').style.display = 'block';
}

function feedAdjApply(d) {
  const el = document.getElementById('feed-apply-n');
  if (!el) return;
  const cur = parseInt(el.textContent) || 0;
  el.textContent = Math.max(0, cur + d);
}

function feedApplyVitae(safeMax) {
  const c = feedGetChar();
  if (!c) return;
  const n = parseInt(document.getElementById('feed-apply-n').textContent) || 0;
  if (n === 0) { toast('0 vitae — nothing to apply'); return; }
  const cur = stGetTracker(c);
  const maxV = stMaxVitae(c);
  const newV = Math.min(maxV, cur.vitae + n);
  const gained = newV - cur.vitae;
  cur.vitae = newV;
  stSetTracker(c, cur);
  // Update live tracker if character is open in ST overview
  const slug = c.name.replace(/[^a-z0-9]/gi, '');
  const el = document.getElementById('stv-v-' + slug);
  if (el) el.textContent = newV;
  const over = n > safeMax ? ' ⚠ Humanity check required' : '';
  toast(c.name + ': +' + gained + ' Vitae' + (newV >= maxV ? ' (full)' : '') + over);
}

function feedReset() {
  document.getElementById('feed-result-section').style.display = 'none';
  document.getElementById('feed-vessel-row').innerHTML = '';
  document.getElementById('feed-push-row').innerHTML = '';
}

// ══════════════════════════════════════════════
//  CLEAR FEED STATE (called from tracker.js on char change)
// ══════════════════════════════════════════════

function feedClearState() {
  feedMethod = null;
  const mc = document.getElementById('feed-methods');
  if (mc) mc.querySelectorAll('.feed-method-card').forEach(c => c.classList.remove('selected'));
  const fps = document.getElementById('feed-pool-section');
  const frs = document.getElementById('feed-result-section');
  const fvr = document.getElementById('feed-vessel-row');
  const fpr = document.getElementById('feed-push-row');
  if (fps) fps.style.display = 'none';
  if (frs) frs.style.display = 'none';
  if (fvr) fvr.innerHTML = '';
  if (fpr) fpr.innerHTML = '';
}

// ══════════════════════════════════════════════
//  EXPORTS
// ══════════════════════════════════════════════

export {
  FEED_METHODS,
  FEED_TERRS,
  feedToggle,
  feedInit,
  feedSelectMethod,
  feedGetChar,
  feedBuildPool,
  feedRoll,
  feedAdjApply,
  feedApplyVitae,
  feedReset,
  feedClearState
};
