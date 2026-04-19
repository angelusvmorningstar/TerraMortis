/* dev-fixtures.js — fixture intercept for local dev (index.html).
 *
 * Activated when: localStorage.tm_auth_token === 'local-test-token'
 * (set by public/dev-login.html — never present in production builds).
 *
 * Patches window.fetch to intercept /api/* calls and return static fixture
 * data. All components receive the same JSON shape as from the real API.
 * No component needs to know it is using fixtures.
 *
 * Fixture source files: data/dev-fixtures/*.json
 * To update fixtures with real data, export from MongoDB Atlas and replace
 * the inline arrays below (or replace the JSON files and paste here).
 *
 * Characters cover: Head of State (Marcus Vale), Regent (Sera Dusk),
 * Socialite/Harpy (Vivian Cross), and four other clans/covenants.
 * Sera Dusk is regent of The Academy territory — triggers the Regency
 * conditional tab for any player logged in as her character.
 * Marcus Vale has court_category:'Head of State' — triggers the Office tab.
 */

const _DEV_TOKEN = 'local-test-token';

const _isDev = (() => {
  try { return localStorage.getItem('tm_auth_token') === _DEV_TOKEN; }
  catch { return false; }
})();

if (!_isDev) {
  // Production build — do nothing, export empty module
} else {

// ── Fixture data ──────────────────────────────────────────────────────────────

const CHARS = [
  {
    _id: '600000000000000000000001',
    name: 'Marcus Vale', honorific: 'Lord', moniker: null,
    player: 'Dev ST', concept: 'The Prince', pronouns: 'he/him',
    clan: 'Ventrue', bloodline: null, covenant: 'Invictus',
    mask: 'Director', dirge: 'Authoritarian',
    court_category: 'Head of State', court_title: 'Prince',
    apparent_age: '45', blood_potency: 3, humanity: 5, humanity_base: 7,
    xp_total: 40, xp_spent: 38,
    status: { city: 5, clan: 3, covenant: 3 },
    attributes: {
      Intelligence: { dots: 3, bonus: 0 }, Wits: { dots: 3, bonus: 0 },
      Resolve:      { dots: 3, bonus: 0 }, Strength: { dots: 2, bonus: 0 },
      Dexterity:    { dots: 2, bonus: 0 }, Stamina:  { dots: 3, bonus: 0 },
      Presence:     { dots: 4, bonus: 0 }, Manipulation: { dots: 4, bonus: 0 },
      Composure:    { dots: 3, bonus: 0 },
    },
    skills: {
      Politics:      { dots: 4, bonus: 0, specs: ['Court Intrigue'], nine_again: false },
      Persuasion:    { dots: 3, bonus: 0, specs: [], nine_again: false },
      Intimidation:  { dots: 3, bonus: 0, specs: [], nine_again: false },
      Subterfuge:    { dots: 2, bonus: 0, specs: [], nine_again: false },
      Socialise:     { dots: 3, bonus: 0, specs: ['High Society'], nine_again: false },
    },
    disciplines: { Dominate: { dots: 3 }, Majesty: { dots: 2 }, Resilience: { dots: 1 } },
    merits: [
      { category: 'influence', name: 'Resources', rating: 4, rule_key: 'resources' },
      { category: 'influence', name: 'Contacts', rating: 2, area: 'Politics', rule_key: 'contacts' },
      { category: 'standing', name: 'Mystery Cult Initiation', rating: 3, rule_key: 'mystery-cult-initiation' },
    ],
  },
  {
    _id: '600000000000000000000002',
    name: 'Sera Dusk', honorific: 'Doctor', moniker: null,
    player: 'Dev ST', concept: 'Shadow Scholar', pronouns: 'she/her',
    clan: 'Mekhet', bloodline: null, covenant: 'Ordo Dracul',
    mask: 'Scientist', dirge: 'Scholar',
    court_category: null, court_title: null,
    apparent_age: '30', blood_potency: 2, humanity: 6, humanity_base: 7,
    xp_total: 30, xp_spent: 28,
    status: { city: 3, clan: 2, covenant: 2 },
    attributes: {
      Intelligence: { dots: 4, bonus: 0 }, Wits:      { dots: 4, bonus: 0 },
      Resolve:      { dots: 3, bonus: 0 }, Strength:  { dots: 1, bonus: 0 },
      Dexterity:    { dots: 3, bonus: 0 }, Stamina:   { dots: 2, bonus: 0 },
      Presence:     { dots: 2, bonus: 0 }, Manipulation: { dots: 3, bonus: 0 },
      Composure:    { dots: 3, bonus: 0 },
    },
    skills: {
      Occult:        { dots: 4, bonus: 0, specs: ['Coils of the Dragon'], nine_again: false },
      Investigation: { dots: 3, bonus: 0, specs: ['Research'], nine_again: true },
      Academics:     { dots: 3, bonus: 0, specs: [], nine_again: false },
      Stealth:       { dots: 2, bonus: 0, specs: [], nine_again: false },
    },
    disciplines: { Auspex: { dots: 3 }, Obfuscate: { dots: 2 }, 'Coils of the Dragon': { dots: 2 } },
    merits: [
      { category: 'influence', name: 'Contacts', rating: 2, area: 'Academia', rule_key: 'contacts' },
    ],
  },
  {
    _id: '600000000000000000000003',
    name: 'Ren Ashby', honorific: null, moniker: 'Ash',
    player: 'Dev ST', concept: 'Street Fixer', pronouns: 'they/them',
    clan: 'Nosferatu', bloodline: null, covenant: 'Carthian Movement',
    mask: 'Activist', dirge: 'Rebel',
    court_category: null, court_title: null,
    apparent_age: '25', blood_potency: 1, humanity: 7, humanity_base: 7,
    xp_total: 20, xp_spent: 18,
    status: { city: 2, clan: 1, covenant: 1 },
    attributes: {
      Intelligence: { dots: 2, bonus: 0 }, Wits:      { dots: 4, bonus: 0 },
      Resolve:      { dots: 2, bonus: 0 }, Strength:  { dots: 2, bonus: 0 },
      Dexterity:    { dots: 4, bonus: 0 }, Stamina:   { dots: 2, bonus: 0 },
      Presence:     { dots: 2, bonus: 0 }, Manipulation: { dots: 2, bonus: 0 },
      Composure:    { dots: 2, bonus: 0 },
    },
    skills: {
      Stealth:    { dots: 4, bonus: 0, specs: ['Urban Shadows'], nine_again: false },
      Streetwise: { dots: 3, bonus: 0, specs: [], nine_again: false },
      Athletics:  { dots: 3, bonus: 0, specs: [], nine_again: false },
      Larceny:    { dots: 2, bonus: 0, specs: [], nine_again: false },
    },
    disciplines: { Nightmare: { dots: 2 }, Obfuscate: { dots: 3 } },
    merits: [
      { category: 'influence', name: 'Contacts', rating: 3, area: 'Underworld', rule_key: 'contacts' },
    ],
  },
  {
    _id: '600000000000000000000004',
    name: 'Vivian Cross', honorific: 'Sister', moniker: null,
    player: 'Dev ST', concept: 'Zealous Preacher', pronouns: 'she/her',
    clan: 'Daeva', bloodline: null, covenant: 'Lancea et Sanctum',
    mask: 'Crusader', dirge: 'Zealot',
    court_category: 'Socialite', court_title: 'Harpy',
    apparent_age: '28', blood_potency: 2, humanity: 5, humanity_base: 7,
    xp_total: 28, xp_spent: 26,
    status: { city: 3, clan: 2, covenant: 2 },
    attributes: {
      Intelligence: { dots: 2, bonus: 0 }, Wits:      { dots: 3, bonus: 0 },
      Resolve:      { dots: 2, bonus: 0 }, Strength:  { dots: 2, bonus: 0 },
      Dexterity:    { dots: 2, bonus: 0 }, Stamina:   { dots: 2, bonus: 0 },
      Presence:     { dots: 4, bonus: 0 }, Manipulation: { dots: 3, bonus: 0 },
      Composure:    { dots: 3, bonus: 0 },
    },
    skills: {
      Persuasion:  { dots: 4, bonus: 0, specs: ['Sermons'], nine_again: false },
      Socialise:   { dots: 3, bonus: 0, specs: [], nine_again: false },
      Expression:  { dots: 2, bonus: 0, specs: [], nine_again: false },
      Intimidation:{ dots: 2, bonus: 0, specs: [], nine_again: false },
    },
    disciplines: { Majesty: { dots: 3 }, 'Theban Sorcery': { dots: 2 }, Celerity: { dots: 1 } },
    merits: [
      { category: 'influence', name: 'Allies', rating: 2, area: 'Church', rule_key: 'allies' },
      { category: 'influence', name: 'Herd', rating: 2, rule_key: 'herd' },
    ],
  },
  {
    _id: '600000000000000000000005',
    name: 'Tor Blackwood', honorific: null, moniker: null,
    player: 'Dev ST', concept: 'Feral Hunter', pronouns: 'he/him',
    clan: 'Gangrel', bloodline: null, covenant: 'Circle of the Crone',
    mask: 'Brute', dirge: 'Predator',
    court_category: null, court_title: null,
    apparent_age: '35', blood_potency: 1, humanity: 6, humanity_base: 7,
    xp_total: 18, xp_spent: 16,
    status: { city: 1, clan: 1, covenant: 1 },
    attributes: {
      Intelligence: { dots: 1, bonus: 0 }, Wits:      { dots: 3, bonus: 0 },
      Resolve:      { dots: 3, bonus: 0 }, Strength:  { dots: 4, bonus: 0 },
      Dexterity:    { dots: 3, bonus: 0 }, Stamina:   { dots: 4, bonus: 0 },
      Presence:     { dots: 2, bonus: 0 }, Manipulation: { dots: 1, bonus: 0 },
      Composure:    { dots: 2, bonus: 0 },
    },
    skills: {
      Brawl:    { dots: 4, bonus: 0, specs: ['Claws'], nine_again: false },
      Athletics:{ dots: 3, bonus: 0, specs: [], nine_again: false },
      Survival: { dots: 3, bonus: 0, specs: [], nine_again: false },
      Stealth:  { dots: 2, bonus: 0, specs: [], nine_again: false },
    },
    disciplines: { Protean: { dots: 3 }, Praestantia: { dots: 2 }, Cruac: { dots: 1 } },
    merits: [
      { category: 'influence', name: 'Feeding Grounds', rating: 3, area: 'The Barrens', rule_key: 'feeding-grounds' },
    ],
  },
  {
    _id: '600000000000000000000006',
    name: 'Elara Voss', honorific: 'Lady', moniker: null,
    player: 'Dev Player', concept: 'Ambitious Neonate', pronouns: 'she/her',
    clan: 'Ventrue', bloodline: null, covenant: 'Invictus',
    mask: 'Socialite', dirge: 'Competitor',
    court_category: null, court_title: null,
    apparent_age: '24', blood_potency: 1, humanity: 7, humanity_base: 7,
    xp_total: 14, xp_spent: 12,
    status: { city: 2, clan: 0, covenant: 1 },
    attributes: {
      Intelligence: { dots: 2, bonus: 0 }, Wits:      { dots: 2, bonus: 0 },
      Resolve:      { dots: 2, bonus: 0 }, Strength:  { dots: 2, bonus: 0 },
      Dexterity:    { dots: 2, bonus: 0 }, Stamina:   { dots: 2, bonus: 0 },
      Presence:     { dots: 3, bonus: 0 }, Manipulation: { dots: 3, bonus: 0 },
      Composure:    { dots: 2, bonus: 0 },
    },
    skills: {
      Socialise:  { dots: 3, bonus: 0, specs: ['Galas'], nine_again: false },
      Persuasion: { dots: 2, bonus: 0, specs: [], nine_again: false },
      Politics:   { dots: 2, bonus: 0, specs: [], nine_again: false },
    },
    disciplines: { Dominate: { dots: 1 }, Majesty: { dots: 2 } },
    merits: [
      { category: 'influence', name: 'Resources', rating: 2, rule_key: 'resources' },
      { category: 'influence', name: 'Contacts', rating: 1, area: 'High Society', rule_key: 'contacts' },
    ],
  },
];

const TERRITORIES = [
  {
    _id: 't00000000000000000000001', id: 'academy',
    name: 'The Academy', regent_id: '600000000000000000000002',
    ambience: 'Curated', ambienceMod: 3,
  },
  {
    _id: 't00000000000000000000002', id: 'northshore',
    name: 'The North Shore', regent_id: null,
    ambience: 'Tended', ambienceMod: 2,
  },
  {
    _id: 't00000000000000000000003', id: 'dockyards',
    name: 'The Dockyards', regent_id: null,
    ambience: 'Settled', ambienceMod: 0,
  },
];

const TRACKER_STATE = {
  '600000000000000000000001': { vitae: 8,  willpower: 5, bashing: 0, lethal: 0, aggravated: 0, influence: 6 },
  '600000000000000000000002': { vitae: 9,  willpower: 6, bashing: 0, lethal: 0, aggravated: 0, influence: 3 },
  '600000000000000000000003': { vitae: 5,  willpower: 4, bashing: 2, lethal: 0, aggravated: 0, influence: 3 },
  '600000000000000000000004': { vitae: 7,  willpower: 5, bashing: 0, lethal: 0, aggravated: 0, influence: 4 },
  '600000000000000000000005': { vitae: 4,  willpower: 5, bashing: 0, lethal: 1, aggravated: 0, influence: 1 },
  '600000000000000000000006': { vitae: 6,  willpower: 4, bashing: 0, lethal: 0, aggravated: 0, influence: 3 },
};

const DT_CYCLES = [
  { _id: 'dc0000000000000000000001', cycle: 3, label: 'Downtime Cycle 3',
    status: 'open', open_date: '2026-04-20T00:00:00.000Z', close_date: '2026-05-03T00:00:00.000Z' },
];

const GAME_SESSIONS = [
  { _id: 'gs0000000000000000000001', session_number: 3, date: '2026-05-10T17:00:00.000Z',
    location: 'The Usual Venue', status: 'upcoming' },
];

// ── Fetch intercept ───────────────────────────────────────────────────────────

function _mockResponse(data, status = 200) {
  const body = status === 204 ? null : JSON.stringify(data);
  return Promise.resolve(new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
}

const _origFetch = window.fetch.bind(window);

window.fetch = function devFixtureFetch(url, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  // Strip origin so we match on path only
  const path = String(url).replace(/^https?:\/\/[^/]+/, '');

  if (!path.startsWith('/api/')) return _origFetch(url, opts);

  const seg = path.replace(/^\/api\//, '').split('?')[0].split('/');

  // GET /api/characters
  if (method === 'GET' && seg[0] === 'characters' && !seg[1]) {
    return _mockResponse(CHARS);
  }
  // GET /api/characters/public
  if (method === 'GET' && seg[0] === 'characters' && seg[1] === 'public') {
    return _mockResponse(CHARS);
  }
  // GET /api/characters/status
  if (method === 'GET' && seg[0] === 'characters' && seg[1] === 'status') {
    return _mockResponse(CHARS.map(c => ({
      _id: c._id, name: c.name, honorific: c.honorific, moniker: c.moniker,
      clan: c.clan, covenant: c.covenant, status: c.status,
      court_category: c.court_category, court_title: c.court_title,
      player: c.player, powers: c.powers || [],
      _player_info: { discord_id: null, discord_avatar: null },
    })));
  }
  // GET /api/characters/combat
  if (method === 'GET' && seg[0] === 'characters' && seg[1] === 'combat') {
    return _mockResponse(CHARS.map(c => ({
      _id: c._id, name: c.name, honorific: c.honorific, moniker: c.moniker,
      clan: c.clan, covenant: c.covenant, blood_potency: c.blood_potency,
      attributes: c.attributes, disciplines: c.disciplines,
    })));
  }
  // GET /api/characters/:id
  if (method === 'GET' && seg[0] === 'characters' && seg[1] && seg[1] !== 'public') {
    const c = CHARS.find(x => x._id === seg[1]);
    return c ? _mockResponse(c) : _mockResponse({ error: 'NOT_FOUND' }, 404);
  }
  // PUT /api/characters/:id — accept write, return char
  if (method === 'PUT' && seg[0] === 'characters' && seg[1]) {
    const c = CHARS.find(x => x._id === seg[1]);
    return c ? _mockResponse(c) : _mockResponse({ error: 'NOT_FOUND' }, 404);
  }

  // GET /api/territories
  if (method === 'GET' && seg[0] === 'territories' && !seg[1]) {
    return _mockResponse(TERRITORIES);
  }

  // GET /api/tracker_state/:id
  if (method === 'GET' && seg[0] === 'tracker_state' && seg[1]) {
    const ts = TRACKER_STATE[seg[1]];
    return ts ? _mockResponse(ts) : _mockResponse(null, 404);
  }
  // PUT /api/tracker_state/:id — accept write, return 204
  if (method === 'PUT' && seg[0] === 'tracker_state' && seg[1]) {
    return _mockResponse(null, 204);
  }

  // GET /api/downtime_cycles
  if (method === 'GET' && seg[0] === 'downtime_cycles') {
    return _mockResponse(DT_CYCLES);
  }
  // GET /api/downtime_submissions
  if (method === 'GET' && seg[0] === 'downtime_submissions') {
    return _mockResponse([]);
  }
  // POST /api/downtime_submissions — accept write
  if (method === 'POST' && seg[0] === 'downtime_submissions') {
    return _mockResponse({ _id: 'ds_mock_001', status: 'submitted' }, 201);
  }

  // GET /api/game_sessions
  if (method === 'GET' && seg[0] === 'game_sessions') {
    return _mockResponse(GAME_SESSIONS);
  }

  // GET /api/tickets
  if (method === 'GET' && seg[0] === 'tickets') {
    return _mockResponse([]);
  }
  // POST /api/tickets — accept write
  if (method === 'POST' && seg[0] === 'tickets') {
    return _mockResponse({ _id: 'tk_mock_001', status: 'open' }, 201);
  }

  // GET /api/archive_documents
  if (method === 'GET' && seg[0] === 'archive_documents') {
    return _mockResponse([]);
  }

  // GET /api/health
  if (method === 'GET' && seg[0] === 'health') {
    return _mockResponse({ ok: true });
  }

  // GET /api/players
  if (method === 'GET' && seg[0] === 'players') {
    return _mockResponse([]);
  }

  // All other /api/* — pass through (or return 404 if API server unreachable)
  return _origFetch(url, opts);
};

console.info('[dev-fixtures] Fixture intercept active — 6 characters, 3 territories');

} // end if (_isDev)

export {};
