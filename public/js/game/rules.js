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
      { term: 'Chance Die',         text: 'Pool ≤ 0: roll 1 die. Success only on 10. Dramatic failure on 1.' },
      { term: '10-Again',           text: 'Default. Re-roll any die showing 10 for possible additional success.' },
      { term: '9-Again',            text: 'Re-roll any die showing 9 or 10.' },
      { term: '8-Again',            text: 'Re-roll any die showing 8, 9, or 10.' },
      { term: 'No Again',           text: 'No re-rolls on any result. Often from supernatural resistance.' },
      { term: 'Rote',               text: 'Roll twice, take the best result.' },
      { term: 'Willpower',          text: 'Spend 1 WP for +3 dice on a roll, or +2 on a resistance roll. One per turn.' },
      { term: 'Extended Roll',      text: 'Accumulate successes across number of rolls up to total pool until a threshold is reached.' },
      { term: 'Contested Roll',     text: 'Both parties roll; highest successes wins. Ties go to the defender.' },
    ],
  },
  {
    id: 'resistance',
    title: 'Resistance & Damage',
    entries: [
      { term: 'Reflexive Resistance',         text: 'May be Resisting or Contesting. No action cost.' },
      { term: 'Resistance to mundane action', text: '(Usually) Resolve or Composure vs mental/social action. No action cost.' },
      { term: 'Resistance to Power',          text: '(Usually) Resolve or Composure + BP vs mental/social Power. No action cost.' },
      { term: 'Defence',                      text: '(Usually) Athletics + lower of Dexterity or Wits (reflexive, subtracts from attack pool).' },
      { term: 'Armour',                       text: 'Reduces damage after the roll; general armour reduces first bashing then lethal.' },
      { term: 'Health Track',                 text: 'Stamina + Size (5). Fill from left: Bashing (B), Lethal (L), Aggravated (A).' },
      { term: 'Wound Penalties',              text: 'Damage marked in rightmost three health boxes imposes −1 / −2 / −3 respectively.' },
      { term: 'Bashing',                      text: 'Unarmed strikes, almost all damage to vampires. 1 Vitae per 2 Bashing healed.' },
      { term: 'Lethal',                       text: 'Some powers, Protean attacks, sunlight for Humanity 5+. 1 Vitae per 1 Lethal healed.' },
      { term: 'Aggravated',                   text: 'Fire, sunlight, occasionally supernatural claws/fangs. 5 Vitae and a full day’s sleep per point to heal.' },
      { term: 'Staked',                       text: '5+ successes and 5+ damage (net) with a sharpened wooden stake. Vampire enters torpor until removed.' },
      { term: 'Torpor',                       text: 'All health boxes filled with Lethal. Vampire enters torpor.' },
      { term: 'Destruction',                  text: 'All health boxes filled with Aggravated. Vampire is destroyed.' },
    ],
  },
  {
    id: 'frenzy',
    title: 'Frenzy & Wassail',
    entries: [
      { term: 'Frenzy Trigger',       text: 'Fire, starvation, blood, provocation, humiliation.' },
      { term: 'Resistance Roll',      text: 'Resolve + Composure. 1 success needed. Usually gain Tempted, −1 to future Frenzy Resistance.' },
      { term: 'Delay with WP',        text: 'Spend 1 WP to delay frenzy for 1 round without rolling. Each WP so spent gives +1 to eventual roll.' },
      { term: 'Riding the Wave',      text: 'Wits + Composure after triggering to direct the Frenzy. 1 WP/turn, 5 successes needed to RTW.' },
      { term: 'Touchstone Talk-Down', text: 'A touchstone may attempt to calm a frenzying vampire with a difficult extended roll.' },
      { term: 'Frenzy',               text: 'The Beast pursues its goal relentlessly, but not quite mindlessly. May use all vampiric abilities, add BP to physical pools and resistances.' },
    ],
  },
  {
    id: 'vitae',
    title: 'Vitae & Blood',
    entries: [
      { term: 'Vitae Max',          text: 'Blood Potency + 9 until BP 4; see BP table (VtR pg 90) thereafter.' },
      { term: 'Spend per Round',    text: 'BP Vitae/round until BP 8.' },
      { term: 'Activating Powers',  text: 'Most Disciplines cost 1 Vitae (most common) or 1 WP (less common) to activate; some more or a combination (check power description).' },
      { term: 'Healing Bashing',    text: '1 Vitae per 2 Bashing.' },
      { term: 'Healing Lethal',     text: '1 Vitae per Lethal box healed.' },
      { term: 'Healing Aggravated', text: '5 Vitae + 1 full day of sleep per Aggravated box.' },
      { term: 'Blush of Life',      text: '1 Vitae to appear alive (warm, breathing, etc.) for the scene.' },
      { term: 'Daysleep',           text: 'Vampires sleep by day. Stamina + Resolve to resist; Humanity + Haven to awake during the day.' },
    ],
  },
  {
    id: 'city-status',
    title: 'City Status',
    entries: [
      { term: 'What It Is',            text: 'Your political standing in the domain. Be polite to Kindred who have more; you may look down on those with less. Court positions grant bonus Status while held and powers to give or take it. More detail of praiseworthy acts and sins against the city in the Damnation City document.' },
      { term: '1 dot — Attend',   text: 'Attend gatherings without causing disruption.' },
      { term: '2 dots — Support', text: 'Consistently support praxis.' },
      { term: '3 dots — Fulfil',  text: 'Fulfil city objectives; provide exceptional service.' },
      { term: '4 dots — Advance', text: "Advance the city’s interests; eliminate a threat." },
      { term: '5 dots — Expand',  text: "Greatly expand the city’s power or reputation; assume a major leadership role." },
      { term: 'Head of State (+3)',    text: 'Prince, Archbishop, Oracle, Premier. Can give or take City Status up to their own City Status.' },
      { term: 'Primogen (+2)',         text: 'The most powerful Kindred other than Head of State. Sweeping authority; can give or take City Status once per session.' },
      { term: 'Socialite (+1)',        text: 'Harpy, Tribune, Penitent, Jester, Fool. Can give or take City Status up to their own. No more than 2 in the city.' },
      { term: 'Enforcer (+1)',         text: 'Hound, Master of Elysium, Reeve, Constable. Can take City Status for breaches or violations.' },
      { term: 'Administrator (+1)',    text: 'Seneschal, Arbiter, Legate, Keeper of Records, Chancellor. Can block one City Status change and protect target for the night.' },
    ],
  },
  {
    id: 'territory',
    title: 'Territory',
    entries: [
      { term: 'Eligibility',          text: 'Must be City Status 2+ to claim. Must be seconded by another Kindred who is also City Status 2+.' },
      { term: 'Challenge',            text: 'The Challenge must be openly declared and known. Head of State has no power to block or prevent a Challenge.' },
      { term: 'Blind Bid',            text: 'Influence is secretly committed throughout the game. Recruit other Kindred to add their Influence to your bid. Wheel and deal for support.' },
      { term: 'Resolution',           text: 'Last call 30 minutes before game end. Before tallies are revealed, the Ruler may move tokens (up to their City Status). Tallies revealed publicly. Highest bid wins; defender wins ties. Regent gets +3 to tally; ambience affects tally.' },
      { term: 'Sources of Influence', text: 'Clan Status: 1 per dot. Covenant Status: 1 per dot. Influence merit at 3 dots: 1. Influence merit at 5 dots: 2. Mystery Cult Initiation at 5 dots: 1. Specialist Status at 5 dots: 1.' },
      { term: 'Influence Merits',     text: 'Allies, Contacts, Mentor, Resources, Retainer, Staff, Mortal Status.' },
      { term: 'The Rack',             text: 'Feed +5 · Pop Cap 8.' },
      { term: 'Verdant',              text: 'Feed +4 · Pop Cap 7.' },
      { term: 'Curated',              text: 'Feed +3 · Pop Cap 7.' },
      { term: 'Tended',               text: 'Feed +2 · Pop Cap 6.' },
      { term: 'Settled',              text: 'Feed +0 · Pop Cap 6.' },
      { term: 'Untended',             text: 'Feed −2 · Pop Cap 5.' },
      { term: 'Neglected',            text: 'Feed −3 · Pop Cap 4. Districts naturally decay to Neglected at one step per month.' },
      { term: 'Barrens',              text: 'Feed −4 · Pop Cap N/A.' },
      { term: 'Hostile',              text: 'Feed −5 · Pop Cap N/A.' },
    ],
  },
  {
    id: 'disciplines',
    title: 'Discipline Summaries',
    entries: [
      { term: 'Animalism',     text: 'Commune with and control animals. Higher levels affect the Beast in other vampires.' },
      { term: 'Auspex',        text: 'Heightened senses, aura reading, telepathy, astral projection.' },
      { term: 'Celerity',      text: 'Supernatural speed. Passively penalises attacks; 1V to act first, interrupt another’s action, or move supernaturally fast.' },
      { term: 'Dominate',      text: 'Mental commands requiring eye contact. Victims obey and may forget.' },
      { term: 'Majesty',       text: 'Awe and social dominance. Compels attention, fear, or adoration.' },
      { term: 'Nightmare',     text: 'Inflict terror and hallucinations. Can kill from fear.' },
      { term: 'Obfuscate',     text: 'Concealment from the mind’s eye; personal illusion. Cannot be seen, heard, or noticed.' },
      { term: 'Protean',       text: 'Shapeshift: natural weapons, earth meld, partial and complete animal forms and movement.' },
      { term: 'Resilience',    text: 'Supernatural toughness. Converts Lethal to Bashing; resists damage.' },
      { term: 'Vigor',         text: 'Supernatural strength. Adds to Strength for damage and feats of power.' },
      { term: 'Cruac',         text: 'Circle of the Crone blood magic. Ritual and in-scene powers.' },
      { term: 'Theban Sorcery',text: 'Lancea et Sanctum scripture-based sorcery. Miracles and curses.' },
    ],
  },
  {
    id: 'merits',
    title: 'Common Merit Effects',
    entries: [
      { term: 'Acute Senses (●)',                                    text: 'Add BP to rolls to use senses; no penalty for complete darkness; may be overwhelmed.' },
      { term: 'Allies (● to ●●●●●)',         text: 'Mortals who assist. Can be tasked once per story up to dot rating in task difficulty.' },
      { term: 'City Status',                                              text: 'General vampire political standing. Grants bonus dice on city social rolls equal to the difference between two characters.' },
      { term: 'Contacts (● to ●●●●●)',       text: 'Information sources, one Sphere per dot.' },
      { term: 'Fast Reflexes (●●)',                              text: '+1 or +2 to Initiative.' },
      { term: 'Feeding Grounds (●●●●●)',          text: '+1 die per dot to feeding rolls in the chosen territory.' },
      { term: 'Haven (● to ●●●●●)',          text: 'Safe resting place. Dot rating = affinity for space, sun-proofing; adds to rolls to notice danger and remain awake.' },
      { term: 'Herd (● to ●●●●●)',           text: 'Automatic Vitae per game: 1 Vitae per dot without a roll.' },
      { term: 'Iron Stamina (● to ●●●)',               text: 'Ignore up to dot rating in wound/fatigue penalties.' },
      { term: 'Mortal Status (● to ●●●●●)',  text: 'Standing in a mortal Sphere. Can be used to gain access to favours or resources, or block other actions at one dot lower.' },
      { term: 'Resources (● to ●●●●●)',      text: 'Liquid wealth. Dot rating = comfortable monthly spending, buying power.' },
      { term: 'Retainer (● to ●●●●●)',       text: 'Loyal servant. Dot rating = competence and loyalty.' },
      { term: 'Staff (● to ●●●●●)',          text: 'Each dot represents Staff barely skilled in one skill, garnering exactly one success when called upon.' },
      { term: 'Striking Looks (●●)',                             text: '+1 die (●) or +2 dice (●●) on social rolls where appearance matters.' },
      { term: 'Trained Observer (●/●●●)',              text: 'Gain 9-Again or 8-Again on Perception rolls.' },
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

function renderSections() {
  const q = _query.length >= 3 ? _query : '';
  let h = '';
  for (const sec of RULES) {
    const entries = q ? sec.entries.filter(e => matchesQuery(e, q)) : sec.entries;
    if (q && !entries.length) continue;
    const isOpen = q || _open.has(sec.id);
    h += `<div class="rl-section" id="rl-sec-${sec.id}">`;
    h += `<button class="rl-sec-hd" data-sec="${sec.id}">
      <span class="rl-sec-title">${esc(sec.title)}</span>
      <span class="rl-sec-chev">${isOpen ? '▲' : '▼'}</span>
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

function wireSections(root) {
  root.querySelectorAll('[data-sec]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.sec;
      if (_open.has(id)) _open.delete(id); else _open.add(id);
      const sections = root.querySelector('.rl-sections');
      if (sections) sections.innerHTML = renderSections();
      wireSections(root);
    });
  });
}

function wireRules(root) {
  root.querySelector('#rl-search')?.addEventListener('input', e => {
    _query = e.target.value.trim().toLowerCase();
    const sections = root.querySelector('.rl-sections');
    if (sections) sections.innerHTML = renderSections();
    wireSections(root);
  });
  wireSections(root);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function initRules(el) {
  el.innerHTML = `<div class="rl-wrap"><div class="rl-search-wrap"><input class="rl-search" id="rl-search" type="text" placeholder="Search rules…" autocomplete="off"></div><div class="rl-sections">${renderSections()}</div></div>`;
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
        <button class="rules-panel-close" id="rules-close">✕ Close</button>
      </div>
      <div class="rules-panel-body">
        <div class="rl-wrap"><div class="rl-search-wrap"><input class="rl-search" id="rl-search" type="text" placeholder="Search rules…" autocomplete="off"></div><div class="rl-sections">${renderSections()}</div></div>
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
