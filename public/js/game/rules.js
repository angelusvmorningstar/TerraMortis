/* Game app — Rules Quick Reference.
   Searchable collapsible sections for roll mechanics, resistance, disciplines, merits.
   Used both in the Rules tab and as an overlay from the character sheet. */

// ── Content ──────────────────────────────────────────────────────────────────

const RULES = [
  {
    id: 'rolls',
    title: 'Roll Mechanics',
    entries: [
      { term: 'Dice Pool',          text: 'Attribute + Skill (+ equipment, merits, situational modifiers).' },
      { term: 'Success',            text: 'Each die showing 8 or higher = 1 success. Most actions need 1.' },
      { term: 'Exceptional Success',text: '5 or more successes. Grants a bonus depending on the action.' },
      { term: 'Chance Die',         text: 'Pool \u2264 0: roll 1 die. Success only on 10. Dramatic failure on 1.' },
      { term: '10-Again',           text: 'Default. Re-roll any die showing 10 and add result.' },
      { term: '9-Again',            text: 'Re-roll any die showing 9 or 10.' },
      { term: '8-Again',            text: 'Re-roll any die showing 8, 9, or 10.' },
      { term: 'No Again',           text: 'No re-rolls on any result. Often from supernatural resistance.' },
      { term: 'Rote',               text: 'Re-roll every die that did not show a success (once only).' },
      { term: 'Willpower',          text: 'Spend 1 WP for +3 dice on a roll, or +2 on a resistance roll. Once per roll.' },
      { term: 'Extended Roll',      text: 'Accumulate successes across multiple rolls until a threshold is reached.' },
      { term: 'Contested Roll',     text: 'Both parties roll; highest successes wins. Ties go to the attacker.' },
    ],
  },
  {
    id: 'resistance',
    title: 'Resistance & Damage',
    entries: [
      { term: 'Reflexive Resistance', text: 'Resolve + Composure vs mental/social powers. No action cost.' },
      { term: 'Physical Resistance',  text: 'Stamina + Resilience (if Resilience is active).' },
      { term: 'Blood Potency (Social)',text: 'Defender adds Blood Potency to contested social/supernatural rolls.' },
      { term: 'Defence',              text: 'Lower of Dexterity or Wits + Athletics (reflexive, subtracts from attack pool).' },
      { term: 'Armour',               text: 'Reduces damage after the roll; general armour works vs bashing and lethal.' },
      { term: 'Health Track',         text: 'Stamina + Size (5). Fill from right: Bashing (B), Lethal (L), Aggravated (A).' },
      { term: 'Wound Penalties',      text: '\u22121 at half filled, \u22122 at 3/4 filled, \u22123 at last box (Incapacitated).' },
      { term: 'Bashing',              text: 'Unarmed strikes, blunt objects. Vampires heal 1B per round (passive).' },
      { term: 'Lethal',               text: 'Blades, bullets, most weapons. Requires resting to heal.' },
      { term: 'Aggravated',           text: 'Fire, sunlight, supernatural claws/fangs. Hardest to heal; requires Vitae.' },
      { term: 'Torpor',               text: 'All health boxes filled with Lethal or Aggravated. Vampire enters torpor.' },
    ],
  },
  {
    id: 'frenzy',
    title: 'Frenzy & Wassail',
    entries: [
      { term: 'Frenzy Trigger',       text: 'Fire, starvation, blood, extreme provocation, or Humanity 0.' },
      { term: 'Resistance Roll',      text: 'Resolve + Composure. Difficulty = intensity of trigger (1\u20135 successes).' },
      { term: 'Delay with WP',        text: 'Spend 1 WP to delay frenzy for 1 round without rolling.' },
      { term: 'Riding the Wave',      text: 'Wits + Composure after triggering to retain some control (no fine motor).' },
      { term: 'Touchstone Talk-Down', text: 'A touchstone may attempt to calm a frenzying vampire: Presence + Persuasion.' },
      { term: 'Wassail',              text: 'Full descent: Humanity 0 or catastrophic failure. Beast takes control permanently.' },
    ],
  },
  {
    id: 'vitae',
    title: 'Vitae & Blood',
    entries: [
      { term: 'Vitae Max',        text: 'Blood Potency 1: 10. Increases with BP (see BP table).' },
      { term: 'Spend per Round',  text: 'BP 1: 1/round. BP 2: 2/round. BP 3: 3/round. BP 4: 4/round. BP 5: 5/round. BP 6: 6/round. BP 7: 7/round. BP 8: 8/round. BP 9: 10/round. BP 10: 15/round.' },
      { term: 'Activating Powers',text: 'Most Disciplines cost 1 Vitae to activate (check power description).' },
      { term: 'Healing Bashing',  text: 'Passive, 1B per round. No Vitae cost.' },
      { term: 'Healing Lethal',   text: '1 Vitae per Lethal box healed. Requires rest.' },
      { term: 'Healing Aggravated',text:'1 Vitae + 1 full day of sleep per Aggravated box.' },
      { term: 'Blush of Life',    text: '1 Vitae to appear alive (warm, breathing, etc.) for the scene.' },
      { term: 'Daysleep',         text: 'Vampires are comatose during daylight. Roll to act at dawn/dusk (Humanity).' },
      { term: 'Staking',          text: 'Stake through heart: torpor-like paralysis. Vampire is aware but cannot act.' },
    ],
  },
  {
    id: 'disciplines',
    title: 'Discipline Summaries',
    entries: [
      { term: 'Animalism',    text: 'Commune with and control animals. Higher levels affect the Beast in other vampires.' },
      { term: 'Auspex',       text: 'Heightened senses, aura reading, telepathy, astral projection.' },
      { term: 'Celerity',     text: 'Supernatural speed. Adds dice to physical rolls or grants extra actions.' },
      { term: 'Dominate',     text: 'Mental commands requiring eye contact. Victims obey and may forget.' },
      { term: 'Majesty',      text: 'Awe and social dominance. Compels attention, fear, or adoration.' },
      { term: 'Nightmare',    text: 'Inflict terror and hallucinations. Can cause Humanity loss from fear.' },
      { term: 'Obfuscate',    text: 'Concealment from senses. Cannot be seen, heard, or noticed.' },
      { term: 'Praestantia',  text: 'Gangrel physical prowess. Enhanced Athletics, Defence, and resilience.' },
      { term: 'Protean',      text: 'Shapeshift: natural weapons, earth meld, animal forms, flight.' },
      { term: 'Resilience',   text: 'Supernatural toughness. Converts Lethal to Bashing; resists damage.' },
      { term: 'Vigor',        text: 'Supernatural strength. Adds to Strength for damage and feats of power.' },
      { term: 'Cruac',        text: 'Circle of the Crone blood magic. Ritual and in-scene powers.' },
      { term: 'Theban Sorcery',text:'Lancea et Sanctum scripture-based sorcery. Miracles and curses.' },
      { term: 'Coils of the Dragon',text:'Ordo Dracul transcendence. Overcome vampiric weaknesses.' },
    ],
  },
  {
    id: 'merits',
    title: 'Common Merit Effects',
    entries: [
      { term: 'Feeding Grounds (\u25CF\u25CF\u25CF\u25CF\u25CF)',text: '+1 die per dot to feeding rolls in the chosen territory.' },
      { term: 'Herd (\u25CF to \u25CF\u25CF\u25CF\u25CF\u25CF)',  text: 'Automatic Vitae per game: 1 Vitae per dot without a roll.' },
      { term: 'Haven (\u25CF to \u25CF\u25CF\u25CF\u25CF\u25CF)', text: 'Safe resting place. Dot rating = security and size.' },
      { term: 'Allies (\u25CF to \u25CF\u25CF\u25CF\u25CF\u25CF)',text: 'Mortals who assist. Can be tasked once per story per dot.' },
      { term: 'Contacts (\u25CF to \u25CF\u25CF\u25CF\u25CF\u25CF)',text:'Information sources. Roll Manipulation + Persuasion to use.' },
      { term: 'Resources (\u25CF to \u25CF\u25CF\u25CF\u25CF\u25CF)',text:'Liquid wealth. Dot rating = comfortable monthly spending.' },
      { term: 'Retainer (\u25CF to \u25CF\u25CF\u25CF\u25CF\u25CF)',text:'Loyal servant. Dot rating = competence and loyalty.' },
      { term: 'Status (\u25CF to \u25CF\u25CF\u25CF\u25CF\u25CF)', text: 'Standing in a covenant or mortal organisation.' },
      { term: 'City Status',         text: 'General vampire political standing. Grants bonus dice on city social rolls.' },
      { term: 'Striking Looks (\u25CF\u25CF)', text: '+1 die (\u25CF) or +2 dice (\u25CF\u25CF) on social rolls where appearance matters.' },
      { term: 'Trained Observer (\u25CF/\u25CF\u25CF\u25CF)', text: 'Never suffer \u22123 unskilled penalty for Wits/Composure perception.' },
      { term: 'Fast Reflexes (\u25CF\u25CF)',  text: '+1 or +2 to Initiative.' },
      { term: 'Iron Stamina (\u25CF to \u25CF\u25CF\u25CF)', text: 'Ignore up to \u22123 wound/fatigue penalties per dot.' },
      { term: 'Pusher (\u25CF)',              text: '+1 die when using Persuasion to convince someone to act against interest.' },
    ],
  },
];

// ── State ─────────────────────────────────────────────────────────────────────

const _open = new Set(['rolls']); // sections open by default
let _query  = '';
let _overlayEl = null;

// ── Rendering ─────────────────────────────────────────────────────────────────

function matchesQuery(entry, q) {
  if (!q) return true;
  const hay = (entry.term + ' ' + entry.text).toLowerCase();
  return hay.includes(q);
}

function renderContent() {
  const q = _query.length >= 3 ? _query : '';

  let h = `<div class="rl-search-wrap">
    <input class="rl-search" id="rl-search" type="text" placeholder="Search rules\u2026" value="${esc(q)}" autocomplete="off">
  </div>`;

  for (const sec of RULES) {
    const entries = q ? sec.entries.filter(e => matchesQuery(e, q)) : sec.entries;
    if (q && !entries.length) continue;

    const isOpen = q || _open.has(sec.id);
    h += `<div class="rl-section" id="rl-sec-${sec.id}">`;
    h += `<button class="rl-sec-hd" data-sec="${sec.id}">
      <span class="rl-sec-title">${esc(sec.title)}</span>
      <span class="rl-sec-chev">${isOpen ? '\u25B2' : '\u25BC'}</span>
    </button>`;
    if (isOpen) {
      h += '<div class="rl-entries">';
      for (const e of entries) {
        const termHtml = q ? highlight(esc(e.term), q) : esc(e.term);
        const textHtml = q ? highlight(esc(e.text), q) : esc(e.text);
        h += `<div class="rl-entry"><span class="rl-term">${termHtml}</span><span class="rl-text">${textHtml}</span></div>`;
      }
      h += '</div>';
    }
    h += '</div>';
  }
  return h;
}

function highlight(html, q) {
  // Simple case-insensitive highlight on already-escaped text
  const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
  return html.replace(re, '<mark class="rl-mark">$1</mark>');
}

function wireRules(root) {
  root.querySelector('#rl-search')?.addEventListener('input', e => {
    _query = e.target.value.trim().toLowerCase();
    const content = root.querySelector('.rl-content');
    if (content) content.innerHTML = renderContent();
    wireRules(root);
  });

  root.querySelectorAll('[data-sec]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.sec;
      if (_open.has(id)) _open.delete(id); else _open.add(id);
      const content = root.querySelector('.rl-content');
      if (content) content.innerHTML = renderContent();
      wireRules(root);
    });
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export function initRules(el) {
  el.innerHTML = `<div class="rl-wrap"><div class="rl-content">${renderContent()}</div></div>`;
  wireRules(el);
}

export function openRulesOverlay() {
  if (_overlayEl) { _overlayEl.style.display = 'flex'; return; }

  const el = document.createElement('div');
  el.id = 'rules-overlay';
  el.className = 'rules-overlay';
  el.innerHTML = `
    <div class="rules-panel">
      <div class="rules-panel-hdr">
        <span class="rules-panel-title">Rules Reference</span>
        <button class="rules-panel-close" id="rules-close">\u2715 Close</button>
      </div>
      <div class="rules-panel-body">
        <div class="rl-content">${renderContent()}</div>
      </div>
    </div>`;
  document.body.appendChild(el);
  _overlayEl = el;

  el.querySelector('#rules-close').addEventListener('click', closeRulesOverlay);
  el.addEventListener('click', e => { if (e.target === el) closeRulesOverlay(); });
  wireRules(el);
}

export function closeRulesOverlay() {
  if (_overlayEl) _overlayEl.style.display = 'none';
}

function esc(s) {
  if (s === undefined || s === null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}
